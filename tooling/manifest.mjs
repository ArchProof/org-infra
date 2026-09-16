import { createServer } from 'node:http';
import { isAbsolute } from 'node:path';
import { lstat } from 'node:fs/promises';
import { requireThat, digest, exclusiveJson, nonce } from './core.mjs';

export function checkManifest(manifest) {
  requireThat(['archproof-learning','archproof-state-writer'].includes(manifest.name),'existing_governance_app_must_not_be_recreated');
  const expected=manifest.name==='archproof-state-writer'?{metadata:'read',contents:'write'}:{metadata:'read',administration:'write',contents:'read',repository_hooks:'write',pull_requests:'read',actions:'read',checks:'write'};
  requireThat(JSON.stringify(Object.entries(manifest.default_permissions).sort())===JSON.stringify(Object.entries(expected).sort()),'manifest_permission_mismatch');
  requireThat(manifest.public===(manifest.name==='archproof-learning'),'manifest_availability_mismatch');
  if(manifest.public) for(const value of [manifest.hook_attributes?.url,manifest.setup_url,...(manifest.callback_urls??[])]) {
    const url=new URL(value);
    requireThat(url.protocol==='https:' && !url.username && !url.password && !['localhost','127.0.0.1'].includes(url.hostname),'real_https_urls_required');
  }
  return manifest;
}
// Explicit command; binds only loopback, displays an owner confirmation form.
// The one-time conversion response is written only to an explicitly protected file.
export async function manifestConsent(manifest,approvedDigest,protectedOutput,port=8765) {
  checkManifest(manifest);
  requireThat(digest(JSON.stringify(manifest))===approvedDigest,'manifest_review_digest_mismatch');
  requireThat(isAbsolute(protectedOutput),'protected_output_path_required');
  requireThat(!protectedOutput.replaceAll('\\','/').startsWith(process.cwd().replaceAll('\\','/')+'/'),'credential_output_must_be_outside_checkout');
  try {await lstat(protectedOutput);requireThat(false,'credential_output_exists');} catch(e) {if(e.code!=='ENOENT')throw e;}
  const state=nonce();let used=false;
  const origin=`http://127.0.0.1:${port}`;
  const payload={...manifest,redirect_url:`${origin}/callback`};
  const escape=x=>x.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const server=createServer(async(req,res)=>{
    try {
      requireThat(req.headers.host===`127.0.0.1:${port}`,'host_denied');
      const url=new URL(req.url,origin);
      res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
      if(url.pathname==='/' && req.method==='GET') {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end(`<h1>Register ${escape(manifest.name)}</h1><p>Review the GitHub confirmation. State-writer must be installed only on learner-state. This does not install the App.</p><form method="post" action="https://github.com/organizations/archproof/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(payload))}"><button>Continue to GitHub owner confirmation</button></form>`);return;
      }
      requireThat(url.pathname==='/callback' && req.method==='GET' && !used && url.searchParams.get('state')===state && /^[a-zA-Z0-9_-]+$/.test(url.searchParams.get('code')??''),'callback_refused');
      used=true;
      const response=await fetch(`https://api.github.com/app-manifests/${url.searchParams.get('code')}/conversions`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'}});
      requireThat(response.ok,'manifest_conversion_failed');
      const credentials=await response.json();
      requireThat(credentials.owner?.id===328676511 && credentials.name===manifest.name,'manifest_identity_mismatch');
      await exclusiveJson(protectedOutput,credentials);
      res.end('Registration stored in the supplied protected location. Installation and scope verification remain pending.');server.close();
    } catch {res.statusCode=400;res.end('Consent failed. No credentials are returned to the browser. Inspect protected storage before retrying.');}
  });
  server.listen(port,'127.0.0.1');server.setTimeout(30000);
  const timeout=setTimeout(()=>server.close(),10*60*1000);timeout.unref();
  return {status:'owner_consent_required',url:origin,manifestDigest:approvedDigest};
}
