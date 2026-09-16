import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { authenticate, inventory, credentialEnvironment, requireThat, profileCheck, shaCheck, digest, exclusiveJson, json, nonce } from './core.mjs';
import { backend, storage, putPrivate, getPrivate, stateExists } from './state.mjs';

export function inspectPlan(plan) {
  requireThat(plan.errored!==true && plan.complete!==false,'incomplete_plan');
  const changes=plan.resource_changes??[];
  requireThat(changes.every(r=>['github_repository','github_repository_ruleset','github_repository_environment'].includes(r.type)),'unmanaged_resource_type');
  requireThat(changes.every(r=>!r.change.actions.includes('delete')),'deletion_or_replacement_denied');
  requireThat(changes.every(r=>r.type!=='github_repository' || !r.change.before || r.change.before.visibility===r.change.after?.visibility),'visibility_change_denied');
  requireThat(changes.every(r=>r.type!=='github_repository' || !r.change.before || r.change.before.name===r.change.after?.name),'rename_denied');
  const summary={create:0,update:0,noOp:0,imports:0};
  for(const r of changes){if(r.change.importing)summary.imports++;if(r.change.actions.includes('create'))summary.create++;else if(r.change.actions.includes('update'))summary.update++;else summary.noOp++;}
  return summary;
}
export function validateApplyReceipt(receipt,{sha,planDigest,profileDigest,drillDigest}) {
  requireThat(receipt.schemaVersion==='archproof.saved-plan/v1' && receipt.sourceSha===sha && receipt.planDigest===planDigest && receipt.profileDigest===profileDigest && receipt.drillDigest===drillDigest,'review_binding_mismatch');
  requireThat(Date.parse(receipt.createdAt)>Date.now()-24*60*60*1000,'saved_plan_expired');
}
export async function reconcile(p,mode,sha,work,approvedDigest,drillPath,adoptions={}) {
  profileCheck(p);shaCheck(sha);requireThat(['plan','apply','drift'].includes(mode),'invalid_mode');
  requireThat(process.env.GITHUB_REF==='refs/heads/main' && process.env.GITHUB_REPOSITORY==='archproof/org-infra' && process.env.GITHUB_SHA===sha,'protected_default_branch_required');
  const root=resolve('.');
  const scratch=resolve(work);
  requireThat(scratch!==root && !scratch.startsWith(root+'/') && !scratch.startsWith(root+'\\'),'private_workspace_outside_checkout_required');
  await mkdir(scratch,{recursive:true,mode:0o700});
  const gh=await authenticate(p,{metadata:'read',administration:'write',contents:'write',environments:'write',members:'write'});
  const main=await gh.request('GET','/repos/archproof/org-infra/git/ref/heads/main');
  requireThat(main.object.sha===sha,'reviewed_revision_not_current_main');
  const pemPath=credentialEnvironment(p);
  const environment={...process.env,GITHUB_APP_ID:String(p.appId),GITHUB_APP_INSTALLATION_ID:String(p.installationId),GITHUB_APP_PEM_FILE:await readFile(pemPath,'utf8'),AWS_ACCESS_KEY_ID:process.env[p.state.accessKeyRef],AWS_SECRET_ACCESS_KEY:process.env[p.state.secretKeyRef],AWS_EC2_METADATA_DISABLED:'true',TF_IN_AUTOMATION:'true',TF_INPUT:'0',TF_DATA_DIR:join(scratch,'data'),TF_VAR_reviewer_ids:JSON.stringify(p.reviewers.map(r=>r.id)),TF_VAR_single_owner:String(p.singleOwner)};
  // Backend/provider credential files, profiles, proxy debug and arbitrary CLI flags cannot override reviewed settings.
  for(const key of Object.keys(environment)) if (/^(TF_CLI_ARGS|AWS_PROFILE|AWS_DEFAULT_PROFILE|AWS_SHARED_|AWS_CONFIG_FILE|AWS_SESSION_TOKEN|AWS_WEB_IDENTITY|AWS_CONTAINER_|AWS_ROLE_|GITHUB_BASE_URL)/.test(key)) delete environment[key];
  const run=(args,accept=[0])=>{
    const result=spawnSync('tofu',args,{env:environment,encoding:'utf8',maxBuffer:64*1024*1024,timeout:15*60*1000});
    // Private diagnostics never go to workflow logs/artifacts. No debug tracing.
    if(!args.includes('-json'))appendFileSync(join(scratch,'tofu.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});
    requireThat(!result.error && accept.includes(result.status),'tofu_command_failed_private_details_required');
    return result;
  };
  requireThat(JSON.parse(run(['version','-json']).stdout).terraform_version==='1.12.0','engine_pin_mismatch');
  const backendPath=join(scratch,'backend.json');
  await writeFile(backendPath,JSON.stringify(backend(p.state)),{mode:0o600});
  run(['init','-input=false','-lockfile=readonly',`-backend-config=${backendPath}`]);
  const drillBytes=await readFile(drillPath),drill=JSON.parse(drillBytes);
  requireThat(drill.bucket===p.state.bucket && drill.endpoint===p.state.endpoint && drill.stateKey===p.state.key && drill.sandboxKey===p.state.sandboxKey && drill.conditionalMutualExclusion && drill.versionBackupRestore && drill.tofuProcessLockVerified && Date.parse(drill.checkedAt)>Date.now()-7*86400000,'fresh_state_drill_required');
  requireThat((p.state.kind==='b2' && drill.productionB2Verified) || (p.state.kind==='minio' && drill.productionMinioVerified),'production_storage_gate');
  const client=storage(p.state),profileDigest=digest(JSON.stringify(p)),drillDigest=digest(drillBytes);
  const planPath=join(scratch,'reviewed.plan');
  if(mode==='apply') {
    requireThat(/^[0-9a-f]{64}$/.test(approvedDigest),'reviewed_digest_required');
    const prefix=`github/plans/${sha}/${approvedDigest}`;
    const saved=await getPrivate(client,p.state,prefix+'.plan');
    requireThat(digest(saved)===approvedDigest,'saved_plan_digest_mismatch');
    const receipt=JSON.parse(await getPrivate(client,p.state,prefix+'.json'));
    validateApplyReceipt(receipt,{sha,planDigest:approvedDigest,profileDigest,drillDigest});
    await writeFile(planPath,saved,{flag:'wx',mode:0o600});
    inspectPlan(JSON.parse(run(['show','-json',planPath]).stdout));
    run(['apply','-input=false','-lock-timeout=60s',planPath]);
    return {status:'applied',sourceSha:sha,planDigest:approvedDigest};
  }
  const repos=await inventory(gh,p);
  const catalog=await json('catalog.json');
  // Existing objects must already be in state or have a reviewed explicit import.
  const state=await stateExists(client,p.state)?JSON.parse(run(['show','-json']).stdout):null;
  for(const repo of repos.filter(r=>Object.keys(catalog).includes(r.name))) {
    const address=`github_repository.catalog["${repo.name}"]`;
    const managed=state?.values?.root_module?.resources?.find(r=>r.address===address);
    requireThat(managed?Number(managed.values.repo_id)===repo.id:adoptions[repo.name]===repo.id,'name_collision_requires_reviewed_import');
  }
  const result=run(['plan','-input=false','-lock-timeout=60s','-detailed-exitcode',`-out=${planPath}`],[0,2]);
  const summary=inspectPlan(JSON.parse(run(['show','-json',planPath]).stdout));
  const bytes=await readFile(planPath),planDigest=digest(bytes);
  const receipt={schemaVersion:'archproof.saved-plan/v1',createdAt:new Date().toISOString(),sourceSha:sha,planDigest,profileDigest,drillDigest,summary,runId:process.env.GITHUB_RUN_ID};
  const prefix=`github/plans/${sha}/${planDigest}`;
  await putPrivate(client,p.state,prefix+'.plan',bytes);
  await putPrivate(client,p.state,prefix+'.json',JSON.stringify(receipt));
  return {...receipt,status:result.status===2?'changes':'clean',restrictedDetails:`s3://${p.state.bucket}/${prefix}.plan`};
}

export async function updateDrift(gh,status,runUrl) {
  requireThat(['clean','changes','error'].includes(status),'invalid_drift_status');
  requireThat(/^https:\/\/github.com\/archproof\/org-infra\/actions\/runs\/\d+$/.test(runUrl),'invalid_run_url');
  const base='/repos/archproof/org-infra/issues';
  const marker='<!-- archproof-gitops-drift/v1 -->';
  const issues=(await gh.pages(base+'?state=open')).filter(i=>!i.pull_request && i.body?.startsWith(marker) && i.user?.type==='Bot');
  const body=`${marker}\nGitOps status: ${status}. [Protected run](${runUrl}). Raw plans remain private. No automatic apply.`;
  if(status==='clean') {for(const issue of issues) await gh.request('PATCH',`${base}/${issue.number}`,{state:'closed'});}
  else if(issues.length) {
    await gh.request('PATCH',`${base}/${issues[0].number}`,{body});
    for(const duplicate of issues.slice(1))await gh.request('PATCH',`${base}/${duplicate.number}`,{state:'closed'});
  } else await gh.request('POST',base,{title:'GitOps drift requires review',body});
  return {status,openIssueCount:status==='clean'?0:1};
}
