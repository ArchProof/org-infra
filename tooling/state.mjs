import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, CreateBucketCommand, PutBucketVersioningCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireThat, digest, exclusiveJson, nonce, stateCheck } from './core.mjs';

export function storage(state, env=process.env) {
  stateCheck(state);
  const accessKeyId=env[state.accessKeyRef],secretAccessKey=env[state.secretKeyRef];
  requireThat(accessKeyId && secretAccessKey,'explicit_state_credentials_required');
  return new S3Client({endpoint:state.endpoint,region:state.region,forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId,secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
}
export function backend(state, sandbox=false) {
  return {bucket:state.bucket,key:sandbox?state.sandboxKey:state.key,region:state.region,endpoints:{s3:state.endpoint},use_path_style:true,use_lockfile:true,skip_credentials_validation:true,skip_region_validation:true,skip_metadata_api_check:true,skip_requesting_account_id:true,skip_s3_checksum:true};
}
export async function putPrivate(client,state,key,body) {
  return client.send(new PutObjectCommand({Bucket:state.bucket,Key:key,Body:body,IfNoneMatch:'*'}));
}
export async function getPrivate(client,state,key) {
  const r=await client.send(new GetObjectCommand({Bucket:state.bucket,Key:key}));
  return Buffer.from(await r.Body.transformToByteArray());
}
export async function stateExists(client,state) {
  try {await client.send(new HeadObjectCommand({Bucket:state.bucket,Key:state.key}));return true;}
  catch(error) {if(error.$metadata?.httpStatusCode===404)return false;throw error;}
}

// Destructive operations are limited to a newly generated probe prefix. No state
// file is restored/rewound. Historical versions remain as recovery evidence.
export async function stateDrill(state,output,{createSandboxBucket=false,client=storage(state)}={}) {
  stateCheck(state);
  requireThat(state.key!==state.sandboxKey && state.key.startsWith('github/') && state.sandboxKey.startsWith('github/'),'independent_state_required');
  if(createSandboxBucket) {
    requireThat((state.kind==='minio-sandbox' || state.kind==='minio') && /^(ap-gh01-(sandbox|prod)-[a-z0-9-]+|archproof-gitops-[a-z0-9-]+)$/.test(state.bucket),'sandbox_bucket_required');
    // An existing bucket is never reconfigured.
    let exists=true;
    try {await client.send(new HeadBucketCommand({Bucket:state.bucket}));} catch(e) {if(e.$metadata?.httpStatusCode===404) exists=false;else throw e;}
    requireThat(!exists,'sandbox_bucket_already_exists');
    await client.send(new CreateBucketCommand({Bucket:state.bucket}));
    await client.send(new PutBucketVersioningCommand({Bucket:state.bucket,VersioningConfiguration:{Status:'Enabled'}}));
  }
  const prefix=`github/probes/${nonce()}/`,lock=prefix+'state.tflock',key=prefix+'recovery';
  const contenders=await Promise.allSettled([putPrivate(client,state,lock,'first'),putPrivate(client,state,lock,'second')]);
  requireThat(contenders.filter(x=>x.status==='fulfilled').length===1 && contenders.filter(x=>x.status==='rejected' && x.reason.$metadata?.httpStatusCode===412).length===1,'mutual_exclusion_failed_no_apply');
  await client.send(new DeleteObjectCommand({Bucket:state.bucket,Key:lock}));
  await putPrivate(client,state,lock,'reacquired');
  const original=randomBytes(64),changed=randomBytes(64);
  const first=await client.send(new PutObjectCommand({Bucket:state.bucket,Key:key,Body:original}));
  const second=await client.send(new PutObjectCommand({Bucket:state.bucket,Key:key,Body:changed}));
  requireThat(first.VersionId && first.VersionId!=='null' && second.VersionId && first.VersionId!==second.VersionId,'versioning_required_no_apply');
  const versions=await client.send(new ListObjectVersionsCommand({Bucket:state.bucket,Prefix:key}));
  requireThat(versions.Versions?.some(v=>v.VersionId===first.VersionId),'version_backup_missing');
  const backup=await client.send(new GetObjectCommand({Bucket:state.bucket,Key:key,VersionId:first.VersionId}));
  const restored=Buffer.from(await backup.Body.transformToByteArray());
  requireThat(digest(restored)===digest(original),'version_backup_corrupt');
  await client.send(new PutObjectCommand({Bucket:state.bucket,Key:key,Body:restored}));
  requireThat(digest(await getPrivate(client,state,key))===digest(original),'restore_failed');
  await client.send(new DeleteObjectCommand({Bucket:state.bucket,Key:lock}));
  const processEvidence=await tofuLockDrill(client,state,prefix);
  const result={schemaVersion:'archproof.state-drill/v1',checkedAt:new Date().toISOString(),kind:state.kind,endpoint:state.endpoint,bucket:state.bucket,stateKey:state.key,sandboxKey:state.sandboxKey,probePrefix:prefix,conditionalMutualExclusion:true,lockReacquired:true,versionBackupRestore:true,productionB2Verified:state.kind==='b2',productionMinioVerified:state.kind==='minio',...processEvidence,status:'storage_and_tofu_verified'};
  await exclusiveJson(output,result);
  return result;
}

async function tofuLockDrill(client,state,prefix) {
  const directory=await mkdtemp(join(tmpdir(),'apgh01-state-'));
  const environment={...process.env,AWS_ACCESS_KEY_ID:process.env[state.accessKeyRef],AWS_SECRET_ACCESS_KEY:process.env[state.secretKeyRef],AWS_EC2_METADATA_DISABLED:'true',TF_IN_AUTOMATION:'true',TF_INPUT:'0'};
  for(const key of Object.keys(environment))if(/^(TF_CLI_ARGS|TF_LOG|TF_DATA_DIR|AWS_PROFILE|AWS_DEFAULT_PROFILE|AWS_SHARED_|AWS_CONFIG_FILE|AWS_SESSION_TOKEN|AWS_WEB_IDENTITY|AWS_CONTAINER_|AWS_ROLE_)/.test(key))delete environment[key];
  const tofu=process.env.TOFU_BINARY??'tofu';
  const run=(cwd,args)=>spawnSync(tofu,args,{cwd,env:environment,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
  requireThat(JSON.parse(run(directory,['version','-json']).stdout).terraform_version==='1.12.0','engine_pin_mismatch');
  const keys=[prefix+'a.tfstate',prefix+'b.tfstate'];
  const dirs=[];
  for(let i=0;i<2;i++) {
    const path=join(directory,String(i));dirs.push(path);await mkdir(path);
    await writeFile(join(path,'main.tf'),await readFile(new URL('../fixtures/state-probe/main.tf',import.meta.url)));
    await writeFile(join(path,'backend.json'),JSON.stringify({...backend(state),key:keys[i]}),{mode:0o600});
    requireThat(run(path,['init','-input=false','-backend-config=backend.json']).status===0,'probe_init_failed');
  }
  const lockKey=keys[0]+'.tflock';
  await putPrivate(client,state,lockKey,JSON.stringify({ID:nonce(),Operation:'OperationTypeApply',Info:'AP-GH-01 contention probe',Who:'fixture',Version:'1.12.0',Created:new Date().toISOString(),Path:`${state.bucket}/${keys[0]}`}));
  try {
    const blocked=run(dirs[0],['plan','-input=false','-lock-timeout=0s']);
    requireThat(blocked.status===1 && /Error acquiring the state lock/.test(blocked.stderr+blocked.stdout),'tofu_failed_to_respect_lock');
    requireThat(run(dirs[1],['plan','-input=false','-out=probe.plan']).status===0,'independent_key_blocked');
    requireThat(run(dirs[1],['apply','-input=false','probe.plan']).status===0,'sandbox_probe_apply_failed');
    requireThat(run(dirs[1],['plan','-input=false','-detailed-exitcode']).status===0,'sandbox_probe_not_converged');
  } finally {await client.send(new DeleteObjectCommand({Bucket:state.bucket,Key:lockKey}));}
  requireThat(run(dirs[0],['plan','-input=false','-out=probe.plan']).status===0,'lock_recovery_failed');
  requireThat(run(dirs[0],['apply','-input=false','probe.plan']).status===0,'resumed_probe_failed');
  requireThat(run(dirs[0],['plan','-input=false','-detailed-exitcode']).status===0,'resumed_probe_not_converged');
  return {tofuProcessLockVerified:true,independentSandboxStateVerified:true,sandboxApplyEmptyReplan:true,lockFailureResume:true,probeStateKeys:keys};
}
