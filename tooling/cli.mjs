import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { json, prepare, requireThat, profileCheck, digest, GitHub, GitOpsFailure } from './core.mjs';
import { bootstrap, syncSecrets } from './bootstrap.mjs';
import { stateDrill } from './state.mjs';
import { reconcile, updateDrift } from './runner.mjs';
import { manifestConsent } from './manifest.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function main(args) {
  const [command,...rest]=args,options={};
  const allowed=['profile','commit','output','bundle','approved-digest','journal','adopt-id','references','state','create-sandbox-bucket','work','drill','adoptions','manifest','protected-output','status','run-url'];
  for(let i=0;i<rest.length;i+=2)requireThat(rest[i]?.startsWith('--') && allowed.includes(rest[i].slice(2)) && rest[i+1] && !Object.hasOwn(options,rest[i].slice(2)) && (options[rest[i].slice(2)]=rest[i+1]),'invalid_arguments');
  if(command==='validate') {
    const catalog=await json(resolve(root,'catalog.json'));
    requireThat(Object.keys(catalog).sort().join(',')==='actions,kill-the-secrets,learner-state,missions,org-infra,platform,workflows','catalog_keys_invalid');
    for(const [key,repo]of Object.entries(catalog)) requireThat(repo.visibility===(['platform','learner-state'].includes(key)?'private':'public') && repo.template===(key==='kill-the-secrets'),'catalog_policy_invalid');
    let workflow;
    try { workflow=await readFile(resolve(root,'seed/.github/workflows/validate.yml'),'utf8'); }
    catch(e) {if(e.code!=='ENOENT')throw e;workflow=await readFile(resolve(root,'.github/workflows/validate.yml'),'utf8');}
    requireThat(!/secrets\.|pull_request_target|environment:|id-token: write/.test(workflow),'untrusted_credentials_denied');
    return {status:'catalog_and_pr_boundary_valid'};
  }
  if(command==='prepare')return prepare(await json(options.profile),options.commit,options.output);
  if(command==='bootstrap')return bootstrap(await json(options.bundle),options['approved-digest'],options.journal,options['adopt-id']?Number(options['adopt-id']):undefined);
  if(command==='sync-secrets')return syncSecrets(profileCheck(await json(options.profile)),await json(options.references));
  if(command==='state-drill')return stateDrill(await json(options.state),options.output,{createSandboxBucket:options['create-sandbox-bucket']==='true'});
  if(['plan','apply','drift'].includes(command))return reconcile(await json(options.profile),command,options.commit,options.work,options['approved-digest'],options.drill,options.adoptions?await json(options.adoptions):{});
  if(command==='drift-issue') {
    requireThat(process.env.GITHUB_REPOSITORY==='archproof/org-infra' && process.env.GITHUB_REF==='refs/heads/main' && process.env.ARCHPROOF_NATIVE_TOKEN,'native_issue_context_required');
    return updateDrift(new GitHub(process.env.ARCHPROOF_NATIVE_TOKEN),options.status,options['run-url']);
  }
  if(command==='manifest-consent')return manifestConsent(await json(options.manifest),options['approved-digest'],options['protected-output']);
  throw new Error('unknown_command');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(JSON.stringify({status:'refused_or_failed',code:error instanceof GitOpsFailure?error.message:'operation_failed',message:'Check reviewed inputs, permissions and protected receipts. Upstream bodies and credentials are omitted. No automatic retry.'}));process.exitCode=1;});
