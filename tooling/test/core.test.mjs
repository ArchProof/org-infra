import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers';
import { profileCheck, credentialEnvironment, GitHub, inventory, verifyBundle, digest, authenticate, identity, rulesBody, environmentBody, verifyMinioLicense } from '../core.mjs';
import { inspectPlan, validateApplyReceipt, updateDrift } from '../runner.mjs';
import { bootstrap, syncSecrets } from '../bootstrap.mjs';
import { checkManifest } from '../manifest.mjs';
import { main } from '../cli.mjs';
import { stateDrill, stateExists } from '../state.mjs';
import { createHash } from 'node:crypto';

const profile=()=>({schemaVersion:'archproof.gitops-profile/v1',organization:'archproof',...identity,singleOwner:true,reviewers:[{id:123,login:'fixture-owner'}],pemPathRef:'GOVERNANCE_PEM_PATH',state:{kind:'minio-sandbox',endpoint:'http://127.0.0.1:9000',region:'us-east-1',bucket:'ap-gh01-sandbox-fixture',key:'github/org-infra/state.tfstate',sandboxKey:'github/sandbox/state.tfstate',accessKeyRef:'STATE_ACCESS_KEY',secretKeyRef:'STATE_SECRET_KEY'}});
test('catalog and credential-free PR boundary',async()=>assert.equal((await main(['validate'])).status,'catalog_and_pr_boundary_valid'));
for(const [name,mutate] of [
  ['legacy state',p=>p.state.key='gitops-control/terraform.tfstate'],
  ['same state',p=>p.state.sandboxKey=p.state.key],
  ['wrong app',p=>p.appId=1],['wrong owner',p=>p.organizationId=1],['wrong installation',p=>p.installationId=1],
  ['public endpoint',p=>p.state.endpoint='http://evil.example'],['endpoint credentials',p=>p.state.endpoint='http://user:secret@localhost:9000'],
  ['B2 HTTP',p=>{p.state.kind='b2';p.state.endpoint='http://s3.us-west-004.backblazeb2.com';}],
  ['duplicate reviewers',p=>p.reviewers.push(p.reviewers[0])],['impossible independent review',p=>p.singleOwner=false],
  ['secret value as reference',p=>p.state.secretKeyRef='secret value']
])test(`profile refuses ${name}`,()=>{const p=profile();mutate(p);assert.throws(()=>profileCheck(p));});
test('sandbox profile passes without claiming production',()=>assert.equal(profileCheck(profile()).state.kind,'minio-sandbox'));
test('production MinIO profile passes and validates license token',async()=>{
  const p=profile();p.state.kind='minio';p.state.bucket='archproof-gitops-state';
  assert.equal(profileCheck(p).state.kind,'minio');
  const licenseFile=await readFile(new URL('../../../../docs/minio.license',import.meta.url),'utf8');
  const verified=verifyMinioLicense(licenseFile);
  assert.equal(verified.issuer,'subnet@min.io');
  assert.equal(verified.product,'AIStor');
  assert.ok(verified.features.includes('Objects'));
});
test('production B2 profile passes as alternative',()=>{
  const p=profile();p.state.kind='b2';p.state.endpoint='https://s3.us-west-004.backblazeb2.com';p.state.bucket='archproof-gitops-state';
  assert.equal(profileCheck(p).state.kind,'b2');
});
test('malformed or unissued MinIO license rejected',()=>{
  assert.throws(()=>verifyMinioLicense('not-a-jwt'));
  assert.throws(()=>verifyMinioLicense('a.b.c'));
});
for(const key of ['GITHUB_TOKEN','GH_TOKEN','GITHUB_APP_PEM_FILE','GITHUB_OWNER','TF_LOG','NODE_OPTIONS'])test(`ambient ${key} refused`,()=>assert.throws(()=>credentialEnvironment(profile(),{[key]:'sentinel'})));
test('transport refuses off-origin and traversal before sending',async()=>{
  let calls=0;const gh=new GitHub('sentinel',()=>{calls++;});
  for(const path of ['https://evil.example','/repos/other/repo','/repos/archproof/../other'])await assert.rejects(gh.request('GET',path));
  assert.equal(calls,0);
});
test('GitHub errors never contain body or token',async()=>{
  const gh=new GitHub('secret-token',async()=>new Response('secret upstream body',{status:403}));
  await assert.rejects(gh.request('GET','/app'),{message:'github_403'});
});
test('pagination ignores malicious Link URL and refuses foreign inventory',async()=>{
  const gh=new GitHub('sentinel',async url=>new Response(JSON.stringify({repositories:[{id:1,owner:{id:2}}]}),{headers:{Link:'<https://evil.example>; rel="next"'}}));
  await assert.rejects(inventory(gh,profile()),{message:'inventory_identity_mismatch'});
});
test('identity verification refuses token issuance for wrong installation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'apgh01-'));const pem=join(dir,'test.pem');
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});await writeFile(pem,keys.privateKey.export({format:'pem',type:'pkcs8'}));
  const calls=[];
  await assert.rejects(authenticate(profile(),{metadata:'read'},{GOVERNANCE_PEM_PATH:pem},async(url,request)=>{
    calls.push(request.method);
    return new Response(JSON.stringify(url.endsWith('/app')?{id:identity.appId,slug:'archproof-governance',owner:{id:identity.organizationId,type:'Organization'}}:{id:1}));
  }),{message:'installation_identity_mismatch'});
  assert.deepEqual(calls,['GET','GET']);
});
const bundle=()=>{const payload={schemaVersion:'archproof.gitops-seed/v1',sourceSha:'a'.repeat(40),profile:profile(),files:{'README.md':Buffer.from('Reviewed seed').toString('base64')}};return {...payload,digest:digest(JSON.stringify(payload))};};
test('installation login casing does not override matching stable IDs',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'apgh01-case-'));const pem=join(dir,'test.pem');
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});await writeFile(pem,keys.privateKey.export({format:'pem',type:'pkcs8'}));
  const calls=[];
  const gh=await authenticate(profile(),{metadata:'read'},{GOVERNANCE_PEM_PATH:pem},async(url,request)=>{
    calls.push(request.method);
    const result=url.endsWith('/app')?{id:identity.appId,slug:'archproof-governance',owner:{id:identity.organizationId,type:'Organization'}}:
      request.method==='POST'?{token:'synthetic-token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{metadata:'read'}}:
      {id:identity.installationId,app_id:identity.appId,account:{id:identity.organizationId,login:'ArchProof',type:'Organization'},suspended_at:null,repository_selection:'all',permissions:{metadata:'read'}};
    return new Response(JSON.stringify(result));
  });
  assert.ok(gh instanceof GitHub);assert.deepEqual(calls,['GET','GET','POST']);
});
test('tampered public seed refused',()=>{const b=bundle();b.files['README.md']='changed';assert.throws(()=>verifyBundle(b,b.digest));});
test('bootstrap never adopts a name collision without numeric approval',async()=>{
  const b=bundle(),calls=[];const gh={request:async(method,path)=>{calls.push(method);return path.startsWith('/orgs/')?{state:'active',role:'admin',user:{id:123}}:{id:123};},pages:async()=>[{id:9,name:'org-infra',visibility:'public',owner:{id:identity.organizationId}}]};
  await assert.rejects(bootstrap(b,b.digest,await mkdtemp(join(tmpdir(),'apgh01-')),undefined,{github:gh}),{message:'repository_collision_requires_reviewed_adoption'});
  assert.deepEqual(calls,['GET','GET']);
});
test('single owner protection permits approval and has no bypass actors',()=>{
  assert.equal(environmentBody(profile()).prevent_self_review,false);
  assert.deepEqual(rulesBody(true).bypass_actors,[]);
  assert.equal(rulesBody(true).rules.find(r=>r.type==='pull_request').parameters.required_approving_review_count,0);
});
const change=(actions,before=null,after=null)=>({resource_changes:[{type:'github_repository',change:{actions,before,after}}]});
for(const actions of [['delete'],['delete','create'],['create','delete']])test(`plan refuses ${actions.join('/')}`,()=>assert.throws(()=>inspectPlan(change(actions))));
test('visibility and rename changes are blocked',()=>{
  assert.throws(()=>inspectPlan(change(['update'],{name:'platform',visibility:'private'},{name:'platform',visibility:'public'})));
  assert.throws(()=>inspectPlan(change(['update'],{name:'platform',visibility:'private'},{name:'other',visibility:'private'})));
});
test('safe redacted plan counts do not leak attributes',()=>assert.deepEqual(inspectPlan(change(['create'],null,{name:'private-repository'})),{create:1,update:0,noOp:0,imports:0}));
test('apply receipt binds SHA, plan, profile, drill and expiry',()=>{
  const expected={sha:'a'.repeat(40),planDigest:'b'.repeat(64),profileDigest:'c'.repeat(64),drillDigest:'d'.repeat(64)};
  const receipt={schemaVersion:'archproof.saved-plan/v1',sourceSha:expected.sha,...expected,createdAt:new Date().toISOString()};
  validateApplyReceipt(receipt,expected);
  for(const key of Object.keys(expected))assert.throws(()=>validateApplyReceipt(receipt,{...expected,[key]:'tampered'}));
  assert.throws(()=>validateApplyReceipt({...receipt,createdAt:'2000-01-01'},expected));
});
test('secret sync sends only libsodium sealed ciphertext and clears raw buffers',async()=>{
  await sodium.ready;const pair=sodium.crypto_box_keypair();const dir=await mkdtemp(join(tmpdir(),'apgh01-'));const path=join(dir,'secret');await writeFile(path,'sentinel-secret');
  const puts=[];const gh={request:async(method,url,body)=>{
    if(url.endsWith('public-key'))return {key_id:'fixture',key:sodium.to_base64(pair.publicKey,sodium.base64_variants.ORIGINAL)};
    if(method==='GET')return {owner:{id:identity.organizationId},visibility:'public'};
    puts.push(body);
  }};
  await syncSecrets(profile(),{GOVERNANCE_PEM:'PEM_FILE',STATE_ACCESS_KEY:'ACCESS_FILE',STATE_SECRET_KEY:'SECRET_FILE'},{github:gh,env:{PEM_FILE:path,ACCESS_FILE:path,SECRET_FILE:path}});
  assert.equal(puts.length,3);assert.ok(!JSON.stringify(puts).includes('sentinel-secret'));
  for(const body of puts)assert.equal(sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value,sodium.base64_variants.ORIGINAL),pair.publicKey,pair.privateKey)),'sentinel-secret');
});
test('drift updates one bot issue and closes duplicates; clean closes the remainder',async()=>{
  const calls=[];const issues=[1,2].map(number=>({number,body:'<!-- archproof-gitops-drift/v1 -->',user:{type:'Bot'}}));
  const gh={pages:async()=>issues,request:async(...args)=>calls.push(args)};
  await updateDrift(gh,'error','https://github.com/archproof/org-infra/actions/runs/123');
  assert.equal(calls.length,2);assert.equal(calls[1][2].state,'closed');
  calls.length=0;await updateDrift(gh,'clean','https://github.com/archproof/org-infra/actions/runs/123');assert.ok(calls.every(c=>c[2].state==='closed'));
});
test('state writer manifest is narrowly scoped; governance cannot be recreated',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../apps/state-writer.json',import.meta.url)));
  checkManifest(manifest);assert.throws(()=>checkManifest({...manifest,name:'archproof-governance'}));
  assert.throws(()=>checkManifest({...manifest,default_permissions:{contents:'write',administration:'write'}}));
});
test('bootstrap creates only org-infra, seeds through App Git APIs, returns imports and resumes without writes',async()=>{
  const b=bundle(),dir=await mkdtemp(join(tmpdir(),'apgh01-bootstrap-'));
  let repo=null,tree=[],head='1'.repeat(40),environment=null,rule=null;const blobs=new Map(),trees=new Map(),commits=new Map(),writes=[];
  const gh={pages:async path=>path.startsWith('/installation')?(repo?[repo]:[]):(rule?[rule]:[]),request:async(method,path,body)=>{
    if(method!=='GET')writes.push([method,path]);
    if(path.startsWith('/users/'))return {id:123};
    if(path.startsWith('/orgs/archproof/memberships/'))return {state:'active',role:'admin',user:{id:123}};
    if(path==='/orgs/archproof/repos'){repo={id:99,name:'org-infra',visibility:'public',owner:{id:identity.organizationId},default_branch:'main',html_url:'https://github.com/archproof/org-infra'};return repo;}
    const base='/repos/archproof/org-infra';
    if(path===base+'/git/ref/heads/main')return {object:{sha:head}};
    if(path.startsWith(base+'/git/commits/')&&method==='GET')return {tree:{sha:commits.get(head)??'initial'}};
    if(path.startsWith(base+'/git/trees/')&&method==='GET')return {truncated:false,tree};
    if(path===base+'/git/blobs'){const bytes=Buffer.from(body.content,'base64');const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(sha,body);return {sha};}
    if(path.startsWith(base+'/git/blobs/')&&method==='GET')return blobs.get(path.split('/').at(-1));
    if(path===base+'/git/trees'){trees.set('tree2',body.tree);return {sha:'tree2'};}
    if(path===base+'/git/commits'){commits.set('2'.repeat(40),body.tree);return {sha:'2'.repeat(40)};}
    if(path===base+'/git/refs/heads/main'){head=body.sha;tree=trees.get(commits.get(head));return {};}
    if(path===base+'/environments/gitops'){
      if(method==='GET')return environment;
      environment={...body,protection_rules:[{type:'required_reviewers',prevent_self_review:body.prevent_self_review,reviewers:body.reviewers.map(r=>({reviewer:{id:r.id}}))}]};return environment;
    }
    if(path===base+'/rulesets'){rule={...body,id:100};return rule;}
    if(path===base+'/rulesets/100')return rule;
    throw new Error('unexpected_fixture_endpoint');
  }};
  const first=await bootstrap(b,b.digest,dir,undefined,{github:gh});
  assert.equal(first.imports.import.length,3);assert.equal(first.repositoryId,99);
  assert.equal(writes.filter(([m,p])=>p==='/orgs/archproof/repos').length,1);
  writes.length=0;assert.deepEqual(await bootstrap(b,b.digest,dir,undefined,{github:gh}),first);assert.deepEqual(writes,[]);
  rule.bypass_actors=[{actor_type:'Integration',actor_id:identity.appId,bypass_mode:'always'}];
  await assert.rejects(bootstrap(b,b.digest,dir,undefined,{github:gh}),{message:'ruleset_collision'});
});
test('failed conditional exclusion blocks all subsequent state operations',async()=>{
  const commands=[];const client={send:async command=>{commands.push(command.constructor.name);return {};}};
  await assert.rejects(stateDrill(profile().state,'unused',{client}),{message:'mutual_exclusion_failed_no_apply'});
  assert.deepEqual(commands,['PutObjectCommand','PutObjectCommand']);
});
test('fresh backend is distinct from access failure during import planning',async()=>{
  assert.equal(await stateExists({send:async()=>{throw {$metadata:{httpStatusCode:404}};}},profile().state),false);
  await assert.rejects(stateExists({send:async()=>{throw {$metadata:{httpStatusCode:403}};}},profile().state));
  assert.equal(await stateExists({send:async()=>({})},profile().state),true);
});
