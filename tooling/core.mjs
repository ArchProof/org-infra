import { createHash, createPrivateKey, sign, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

export const identity = Object.freeze({ appId: 4961360, organizationId: 328676511, installationId: 162097296 });
export const digest = value => createHash('sha256').update(value).digest('hex');
export class GitOpsFailure extends Error {}
export const requireThat = (condition, code) => { if (!condition) throw new GitOpsFailure(code); };
export const json = path => readFile(path, 'utf8').then(JSON.parse);
export async function exclusiveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export function profileCheck(p) {
  requireThat(p.schemaVersion === 'archproof.gitops-profile/v1', 'profile_version');
  requireThat(p.organization === 'archproof' && Object.entries(identity).every(([k,v]) => p[k] === v), 'identity_mismatch');
  requireThat(typeof p.singleOwner === 'boolean' && p.reviewers?.length > 0 && p.reviewers.length <= 6, 'reviewers_required');
  requireThat(p.reviewers.every(r => Number.isSafeInteger(r.id) && r.id > 0 && /^[a-z\d][a-z\d-]{0,38}$/i.test(r.login)), 'reviewer_invalid');
  requireThat(new Set(p.reviewers.map(r=>r.id)).size === p.reviewers.length, 'duplicate_reviewer');
  requireThat(p.singleOwner || p.reviewers.length >= 2, 'independent_review_requires_two_reviewers');
  stateCheck(p.state);
  requireThat(p.pemPathRef === 'GOVERNANCE_PEM_PATH' && p.state.accessKeyRef === 'STATE_ACCESS_KEY' && p.state.secretKeyRef === 'STATE_SECRET_KEY','workflow_reference_names_required');
  return p;
}
export function verifyMinioLicense(jwt) {
  requireThat(typeof jwt === 'string' && jwt.includes('.'), 'minio_license_invalid');
  const parts = jwt.trim().split('.');
  requireThat(parts.length === 3, 'minio_license_jwt_format');
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new GitOpsFailure('minio_license_corrupt');
  }
  requireThat(header.typ === 'JWT' && header.alg === 'ES384', 'minio_license_header_invalid');
  requireThat(payload.iss === 'subnet@min.io' && payload.product === 'AIStor' && Array.isArray(payload.features) && payload.features.includes('Objects'), 'minio_license_unauthorized');
  return { issuer: payload.iss, product: payload.product, plan: payload.plan, features: payload.features };
}
export function stateCheck(state) {
  const p={state};
  requireThat(p.state && ['b2', 'minio', 'minio-sandbox'].includes(p.state.kind), 'state_kind');
  const url = new URL(p.state.endpoint);
  requireThat(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'state_endpoint');
  requireThat(p.state.kind === 'b2' ? url.protocol === 'https:' && /^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(url.hostname) : ['localhost','127.0.0.1','minio'].includes(url.hostname) || url.protocol === 'https:', 'state_endpoint');
  requireThat(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(p.state.bucket), 'state_bucket');
  requireThat(typeof p.state.region === 'string' && /^[a-z0-9-]+$/.test(p.state.region), 'state_region');
  for (const key of [p.state.key,p.state.sandboxKey]) requireThat(typeof key === 'string' && /^github\/[a-zA-Z0-9/_-]+\.tfstate$/.test(key) && !key.includes('..'), 'fresh_github_key_required');
  requireThat(p.state.key !== p.state.sandboxKey, 'independent_state_required');
  for (const name of ['accessKeyRef','secretKeyRef']) requireThat(/^[A-Z][A-Z0-9_]+$/.test(p.state[name]), 'credential_reference_required');
  if (p.state.licensePathRef) requireThat(/^[A-Z][A-Z0-9_]+$/.test(p.state.licensePathRef), 'credential_reference_required');
  return state;
}
export function credentialEnvironment(p, env = process.env) {
  for (const key of ['GH_TOKEN','GITHUB_TOKEN','GITHUB_OAUTH_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_APP_ID','GITHUB_APP_INSTALLATION_ID','GITHUB_APP_PEM_FILE','GITHUB_OWNER','GITHUB_ORGANIZATION','GITHUB_BASE_URL','TF_LOG','TF_LOG_PATH','NODE_OPTIONS','NODE_EXTRA_CA_CERTS'])
    requireThat(!env[key], 'ambient_credential_or_debug_denied');
  const pem = env[p.pemPathRef];
  requireThat(pem && isAbsolute(pem), 'explicit_protected_pem_path_required');
  return pem;
}
export async function appJwt(pemPath, now = Date.now()) {
  const key = createPrivateKey(await readFile(pemPath));
  requireThat(key.asymmetricKeyType === 'rsa', 'rsa_key_required');
  const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const data = `${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:String(identity.appId),iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+300})}`;
  return `${data}.${sign('RSA-SHA256',Buffer.from(data),key).toString('base64url')}`;
}
export class GitHub {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async request(method, path, body, absent = false) {
    requireThat(/^\/(app(?:\/|$)|installation\/repositories|repos\/archproof\/|orgs\/archproof\/(repos|memberships\/)|users\/)/.test(path) && !path.includes('..') && !path.includes('#'), 'endpoint_denied');
    const response = await this.fetcher(`https://api.github.com${path}`, {method, redirect:'error', signal:AbortSignal.timeout(30000), headers:{authorization:`Bearer ${this.token}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','user-agent':'archproof-gitops-bootstrap','content-type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    if (absent && response.status === 404) return null;
    requireThat(response.ok, `github_${response.status}`); // Never render upstream bodies, headers, or transport exceptions.
    return response.status === 204 ? null : response.json();
  }
  async pages(path, property) {
    const all = [];
    for (let page=1; page<=1000; page++) {
      const response = await this.request('GET',`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);
      const rows = property ? response[property] : response;
      requireThat(Array.isArray(rows),'invalid_inventory'); all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error('inventory_limit');
  }
}
export async function authenticate(p, permissions, env = process.env, fetcher = fetch) {
  profileCheck(p);
  const pem = credentialEnvironment(p,env);
  const app = new GitHub(await appJwt(pem),fetcher);
  const info = await app.request('GET','/app');
  requireThat(info.id === p.appId && info.slug === 'archproof-governance' && info.owner?.id === p.organizationId && info.owner?.type === 'Organization', 'app_identity_mismatch');
  const installation = await app.request('GET',`/app/installations/${p.installationId}`);
  requireThat(installation.id === p.installationId && installation.app_id === p.appId && installation.account?.id === p.organizationId && installation.account?.login?.toLowerCase() === p.organization.toLowerCase() && installation.account?.type === 'Organization' && installation.suspended_at === null && installation.repository_selection === 'all','installation_identity_mismatch');
  requireThat(Object.entries(permissions).every(([key,value]) => installation.permissions?.[key] === value || value === 'read' && installation.permissions?.[key] === 'write'), 'permission_gap');
  const result = await app.request('POST',`/app/installations/${p.installationId}/access_tokens`,{permissions});
  requireThat(result.token && Date.parse(result.expires_at) > Date.now() + 60000 && Object.entries(result.permissions).every(([k,v]) => permissions[k] === v || k === 'metadata' && v === 'read') && Object.entries(permissions).every(([k,v])=>result.permissions[k]===v), 'token_scope_invalid');
  return new GitHub(result.token,fetcher);
}
export async function inventory(github,p) {
  const repos = await github.pages('/installation/repositories','repositories');
  requireThat(repos.every(r=>r.owner?.id === p.organizationId) && new Set(repos.map(r=>r.id)).size === repos.length,'inventory_identity_mismatch');
  return repos;
}
export function git(args, cwd='.') {
  return execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
export function shaCheck(sha) { requireThat(/^[0-9a-f]{40}$/.test(sha),'immutable_sha_required'); return sha; }
export async function prepare(p, sha, output) {
  profileCheck(p); shaCheck(sha);
  requireThat(git(['rev-parse',`${sha}^{commit}`]) === sha,'commit_missing');
  const paths = git(['ls-tree','-r','--name-only',sha,'--','infra/github/']).split('\n').filter(Boolean);
  requireThat(paths.length > 10,'seed_files_missing');
  const files = {};
  for (const path of paths) {
    const relative = path.replace(/^infra\/github\//,'').replace(/^seed\//,'');
    requireThat(!relative.startsWith('.') || ['.github/','.gitignore','.terraform.lock.hcl','.tflint.hcl'].some(x=>relative.startsWith(x)), 'seed_path_denied');
    requireThat(!/\.(pem|key|tfstate|plan)$|profile\.local|node_modules\//.test(relative), 'seed_secret_path_denied');
    requireThat(!files[relative], 'seed_path_collision');
    files[relative] = execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'show',`${sha}:${path}`],{maxBuffer:10*1024*1024}).toString('base64');
  }
  files['profile.json'] = Buffer.from(JSON.stringify(p,null,2)+'\n').toString('base64');
  files['.github/CODEOWNERS'] = Buffer.from(`* ${p.reviewers.map(r=>'@'+r.login).join(' ')}\n`).toString('base64');
  const payload = {schemaVersion:'archproof.gitops-seed/v1', sourceSha:sha, profile:p, files};
  const bundle = {...payload,digest:digest(JSON.stringify(payload))};
  await exclusiveJson(output,bundle);
  return {sourceSha:sha,digest:bundle.digest,files:Object.keys(files).sort(),status:'review_required'};
}
export function verifyBundle(bundle, approvedDigest) {
  const {digest:claimed,...payload} = bundle;
  requireThat(claimed === approvedDigest && /^[0-9a-f]{64}$/.test(claimed) && digest(JSON.stringify(payload)) === claimed,'seed_digest_mismatch');
  requireThat(bundle.schemaVersion === 'archproof.gitops-seed/v1','seed_version');
  profileCheck(bundle.profile); shaCheck(bundle.sourceSha);
}
export function rulesBody(singleOwner, check = true) {
  return {name:'gitops-main',target:'branch',enforcement:'active',bypass_actors:[],conditions:{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}},rules:[
    {type:'deletion'},{type:'non_fast_forward'},{type:'required_linear_history'},
    {type:'pull_request',parameters:{required_approving_review_count:singleOwner?0:1,require_code_owner_review:!singleOwner,require_last_push_approval:!singleOwner,dismiss_stale_reviews_on_push:true,required_review_thread_resolution:true}},
    ...(check?[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,do_not_enforce_on_create:false,required_status_checks:[{context:'gitops-validate'}]}}]:[])]};
}
export function environmentBody(p) { return {wait_timer:0,prevent_self_review:!p.singleOwner,can_admins_bypass:false,reviewers:p.reviewers.map(r=>({type:'User',id:r.id})),deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}}; }
export const nonce = () => randomBytes(16).toString('hex');
