import { readFile } from 'node:fs/promises';
import sodium from 'libsodium-wrappers';
import { authenticate, inventory, verifyBundle, environmentBody, rulesBody, requireThat, exclusiveJson, json, digest } from './core.mjs';

// Initial API writes end at an importable baseline. Routine settings are owned by OpenTofu.
// Journal entries are append-only files: a lost response requires explicit ID adoption.
export async function bootstrap(bundle, approvedDigest, journal, adoptionId, dependencies = {}) {
  verifyBundle(bundle,approvedDigest);
  const p = bundle.profile;
  const gh = dependencies.github ?? await authenticate(p,{metadata:'read',administration:'write',contents:'write',workflows:'write',environments:'write',members:'read'});
  let ownerFound=false;
  for (const reviewer of p.reviewers) {
    const user = await gh.request('GET',`/users/${reviewer.login}`);
    requireThat(user.id === reviewer.id,'reviewer_identity_mismatch');
    const membership=await gh.request('GET',`/orgs/archproof/memberships/${reviewer.login}`);
    requireThat(membership.state==='active' && membership.user?.id===reviewer.id,'reviewer_membership_required');
    ownerFound ||= membership.role==='admin';
  }
  requireThat(ownerFound,'organization_owner_reviewer_required');
  const repos = await inventory(gh,p);
  let repository = repos.find(r=>r.name.toLowerCase()==='org-infra');
  let created;
  try { created = await json(`${journal}/created.json`); } catch (error) { if(error.code!=='ENOENT') throw error; }
  if (repository) {
    requireThat(repository.id === (created?.repositoryId ?? adoptionId) && repository.visibility === 'public' && repository.owner.id === p.organizationId,'repository_collision_requires_reviewed_adoption');
    if(created) requireThat(created.seedDigest === bundle.digest,'resume_seed_mismatch');
  } else {
    requireThat(!created && !adoptionId,'recorded_repository_missing');
    repository = await gh.request('POST','/orgs/archproof/repos',{name:'org-infra',visibility:'public',auto_init:true,has_issues:true,has_projects:false,has_wiki:false,allow_merge_commit:false,allow_rebase_merge:false,allow_squash_merge:true,delete_branch_on_merge:true});
    requireThat(repository.owner.id === p.organizationId && repository.visibility === 'public' && repository.default_branch === 'main','created_repository_mismatch');
    await exclusiveJson(`${journal}/created.json`,{repositoryId:repository.id,seedDigest:bundle.digest});
  }
  const base = '/repos/archproof/org-infra';
  const ref = await gh.request('GET',`${base}/git/ref/heads/main`);
  const commit = await gh.request('GET',`${base}/git/commits/${ref.object.sha}`);
  const current = await gh.request('GET',`${base}/git/trees/${commit.tree.sha}?recursive=1`);
  requireThat(!current.truncated,'seed_tree_truncated');
  const marker = current.tree.find(x=>x.path==='.archproof-bootstrap.json');
  let seedSha = ref.object.sha;
  if (marker) {
    const blob = await gh.request('GET',`${base}/git/blobs/${marker.sha}`);
    const receipt = JSON.parse(Buffer.from(blob.content,'base64').toString());
    requireThat(receipt.seedDigest === bundle.digest,'existing_seed_differs_use_pr');
    const leaves=current.tree.filter(x=>x.type!=='tree');
    requireThat(leaves.length===Object.keys(bundle.files).length+1 && leaves.every(x=>x.type==='blob' && (Object.hasOwn(bundle.files,x.path) || x.path==='.archproof-bootstrap.json')),'seed_has_unreviewed_files_use_pr');
    // Resume cannot overwrite any files or reset a branch with subsequent commits.
    for (const [path,encoded] of Object.entries(bundle.files)) {
      const bytes=Buffer.from(encoded,'base64');
      const {createHash}=await import('node:crypto');
      const blobSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      requireThat(current.tree.some(x=>x.path===path && x.sha===blobSha),'seed_changed_use_pr');
    }
  } else {
    requireThat(current.tree.every(x=>x.type==='blob' && x.path==='README.md'),'nonempty_repository_requires_review');
    const tree=[];
    const files={...bundle.files,'.archproof-bootstrap.json':Buffer.from(JSON.stringify({seedDigest:bundle.digest,sourceSha:bundle.sourceSha})).toString('base64')};
    for(const [path,content] of Object.entries(files)) {
      requireThat(!path.startsWith('/') && !path.split('/').includes('..'),'invalid_seed_path');
      const blob=await gh.request('POST',`${base}/git/blobs`,{content,encoding:'base64'});
      tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
    }
    const newTree=await gh.request('POST',`${base}/git/trees`,{tree});
    const seeded=await gh.request('POST',`${base}/git/commits`,{message:`Bootstrap reviewed GitOps seed ${bundle.digest}`,tree:newTree.sha,parents:[ref.object.sha]});
    await gh.request('PATCH',`${base}/git/refs/heads/main`,{sha:seeded.sha,force:false});
    seedSha=seeded.sha;
  }
  // Repeating bootstrap after ownership transfer is forbidden, even if the bundle matches.
  const prior=await gh.request('GET',`${base}/environments/gitops`,undefined,true);
  if(prior) {
    const reviewerRule=(prior.protection_rules??[]).find(x=>x.type==='required_reviewers');
    requireThat(reviewerRule?.prevent_self_review === !p.singleOwner && prior.can_admins_bypass === false && prior.deployment_branch_policy?.protected_branches === true && prior.deployment_branch_policy?.custom_branch_policies === false,'environment_collision_use_import_review');
    const actual=(prior.protection_rules??[]).flatMap(x=>x.reviewers??[]).map(x=>x.reviewer?.id).sort();
    requireThat(JSON.stringify(actual)===JSON.stringify(p.reviewers.map(x=>x.id).sort()),'environment_reviewers_differ');
  } else await gh.request('PUT',`${base}/environments/gitops`,environmentBody(p));
  const rules=await gh.pages(`${base}/rulesets`);
  requireThat(rules.length<=1 && rules.every(r=>r.name==='gitops-main'),'ruleset_collision');
  let rule=rules[0];
  if(!rule) rule=await gh.request('POST',`${base}/rulesets`,rulesBody(p.singleOwner));
  else {
    // Read and compare; never repair through the bootstrap API after creation.
    const detail=await gh.request('GET',`${base}/rulesets/${rule.id}`);
    const desired=rulesBody(p.singleOwner);
    requireThat(detail.enforcement==='active' && detail.target==='branch' && (detail.bypass_actors??[]).length===0 && JSON.stringify(detail.conditions?.ref_name?.include)===JSON.stringify(desired.conditions.ref_name.include) && detail.conditions?.ref_name?.exclude?.length===0,'ruleset_collision');
    requireThat(detail.rules?.length===desired.rules.length && desired.rules.every(expected=>{
      const actual=detail.rules.find(r=>r.type===expected.type);
      return actual && (!expected.parameters || Object.entries(expected.parameters).every(([key,value])=>key==='required_status_checks' ? actual.parameters?.[key]?.length===1 && actual.parameters[key][0].context==='gitops-validate' && actual.parameters[key][0].integration_id==null : JSON.stringify(actual.parameters?.[key])===JSON.stringify(value)));
    }),'ruleset_policy_differs_use_import_review');
  }
  const imports={import:[
    {to:'github_repository.catalog["org-infra"]',id:'org-infra'},
    {to:'github_repository_environment.gitops',id:'org-infra:gitops'},
    {to:'github_repository_ruleset.public["org-infra"]',id:`org-infra:${rule.id}`}
  ]};
  const result={schemaVersion:'archproof.bootstrap-receipt/v1',repositoryId:repository.id,url:repository.html_url,seedDigest:bundle.digest,seedSha,rulesetId:rule.id,imports,status:'baseline_created_import_required'};
  try {await exclusiveJson(`${journal}/baseline-${seedSha}.json`,result);}
  catch(error) {if(error.code!=='EEXIST')throw error;requireThat(JSON.stringify(await json(`${journal}/baseline-${seedSha}.json`))===JSON.stringify(result),'baseline_receipt_mismatch');}
  return result;
}

export async function syncSecrets(p, references, dependencies={}) {
  // Scope is one protected environment; no secret resources ever enter HCL/state.
  const allowed=['GOVERNANCE_PEM','STATE_ACCESS_KEY','STATE_SECRET_KEY'];
  requireThat(Object.keys(references).length===3 && allowed.every(k=>/^[A-Z][A-Z0-9_]+$/.test(references[k])),'secret_references_invalid');
  const gh=dependencies.github??await authenticate(p,{metadata:'read',environments:'write'});
  const repository=await gh.request('GET','/repos/archproof/org-infra');
  requireThat(repository.owner.id===p.organizationId && repository.visibility==='public','repository_identity_mismatch');
  const base='/repos/archproof/org-infra/environments/gitops/secrets';
  const key=await gh.request('GET',`${base}/public-key`);
  await sodium.ready;
  const publicKey=sodium.from_base64(key.key,sodium.base64_variants.ORIGINAL);
  requireThat(publicKey.length===sodium.crypto_box_PUBLICKEYBYTES,'invalid_encryption_key');
  for(const name of allowed) {
    const path=(dependencies.env??process.env)[references[name]];
    const {isAbsolute}=await import('node:path');
    requireThat(path && isAbsolute(path),'protected_secret_file_required');
    const value=await readFile(path);
    try {
      requireThat(value.length>0 && value.length<=48000,'secret_size_invalid');
      const encrypted=sodium.crypto_box_seal(value,publicKey);
      await gh.request('PUT',`${base}/${name}`,{key_id:key.key_id,encrypted_value:sodium.to_base64(encrypted,sodium.base64_variants.ORIGINAL)});
    } finally {value.fill(0);}
  }
  return {status:'encrypted_secrets_synchronized',names:allowed};
}
