#!/usr/bin/env node
/**
 * Standalone Secret Synchronization Tool for org-infra
 *
 * Encrypts and synchronizes secrets into GitHub repository/environments
 * using libsodium public-key cryptography.
 *
 * Usage:
 *   node scripts/sync-secrets.mjs [--profile profile.json] [--references secret-references.json]
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createPrivateKey, sign } from 'node:crypto';
import sodium from 'libsodium-wrappers';

// Parse simple CLI arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const profilePath = getArg('--profile', existsSync('profile.local.json') ? 'profile.local.json' : 'profile.json');
const referencesPath = getArg('--references', 'secret-references.json');

console.log(`\n🔒 ArchProof GitOps Secret Synchronizer`);
console.log(`----------------------------------------`);
console.log(`Profile:    ${profilePath}`);
console.log(`References: ${referencesPath}\n`);

// 1. Load Profile
let profile;
try {
  profile = JSON.parse(await readFile(profilePath, 'utf8'));
} catch (err) {
  console.error(`❌ Failed to read profile at "${profilePath}":`, err.message);
  process.exit(1);
}

const owner = profile.organization || 'archproof';
const repo = 'org-infra';

// 2. Load References
let references;
try {
  references = JSON.parse(await readFile(referencesPath, 'utf8'));
} catch (err) {
  console.error(`❌ Failed to read references at "${referencesPath}":`, err.message);
  console.error(`💡 Tip: Copy secret-references.example.json to secret-references.json and populate env vars.`);
  process.exit(1);
}

// 3. Authenticate with GitHub
async function getAuthToken() {
  // Option A: Explicit GITHUB_TOKEN / PAT
  if (process.env.GITHUB_TOKEN) {
    console.log(`🔑 Using provided GITHUB_TOKEN environment variable.`);
    return process.env.GITHUB_TOKEN;
  }

  // Option B: GitHub App Authentication (via profile.pemPathRef)
  const pemEnvName = profile.pemPathRef || 'GOVERNANCE_PEM_PATH';
  const pemPath = process.env[pemEnvName];

  if (!pemPath) {
    throw new Error(`Environment variable "${pemEnvName}" pointing to GitHub App private key (.pem) is not set.`);
  }

  const resolvedPemPath = isAbsolute(pemPath) ? pemPath : resolve(process.cwd(), pemPath);
  console.log(`🔑 Authenticating as GitHub App (ID: ${profile.appId}) using: ${resolvedPemPath}`);

  const pemContent = await readFile(resolvedPemPath);
  const privateKey = createPrivateKey(pemContent);

  const now = Math.floor(Date.now() / 1000);
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({ iss: String(profile.appId), iat: now - 60, exp: now + 300 });
  const unsignedJwt = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsignedJwt), privateKey).toString('base64url');
  const jwt = `${unsignedJwt}.${signature}`;

  // Exchange JWT for Installation Access Token
  const tokenRes = await fetch(`https://api.github.com/app/installations/${profile.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'archproof-org-infra-sync',
      'X-GitHub-Api-Version': '2026-03-10'
    }
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Failed to obtain installation token (${tokenRes.status}): ${errorText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.token;
}

const token = await getAuthToken();

// 4. Initialize Libsodium
await sodium.ready;

// Helper to make authenticated GitHub requests
async function ghRequest(path, options = {}) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'archproof-org-infra-sync',
      'X-GitHub-Api-Version': '2026-03-10',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub API error on ${path} (${res.status}): ${msg}`);
  }
  return res.status === 204 ? null : res.json();
}

// 5. Encrypt and Upload Secrets
// Targets: Upload to environments (gitops, gitops-plan) and repository level for resilience
const targetEndpoints = [
  { name: 'Environment [gitops]', path: `/repos/${owner}/${repo}/environments/gitops/secrets` },
  { name: 'Environment [gitops-plan]', path: `/repos/${owner}/${repo}/environments/gitops-plan/secrets` },
  { name: 'Repository Secrets', path: `/repos/${owner}/${repo}/actions/secrets` }
];

console.log(`\n📤 Synchronizing secrets to ${owner}/${repo}...`);

for (const target of targetEndpoints) {
  let publicKeyInfo;
  try {
    publicKeyInfo = await ghRequest(`${target.path}/public-key`);
  } catch (err) {
    // Some endpoints may not exist yet if environment hasn't been created; continue to others
    continue;
  }

  const publicKey = sodium.from_base64(publicKeyInfo.key, sodium.base64_variants.ORIGINAL);
  console.log(`\n  Target: ${target.name}`);

  for (const [secretName, envVarOrValue] of Object.entries(references)) {
    // Resolve value from environment variable
    const refVal = process.env[envVarOrValue];
    if (!refVal) {
      console.warn(`    ⚠️  Skipping ${secretName}: env var "${envVarOrValue}" is empty or not set.`);
      continue;
    }

    // Determine if value is a file path or raw string
    let secretBuffer;
    if (existsSync(refVal)) {
      secretBuffer = await readFile(refVal);
    } else {
      secretBuffer = Buffer.from(refVal.trim());
    }

    try {
      if (secretBuffer.length === 0) {
        console.warn(`    ⚠️  Skipping ${secretName}: content is empty.`);
        continue;
      }

      // Seal using libsodium
      const encrypted = sodium.crypto_box_seal(secretBuffer, publicKey);
      const encryptedBase64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

      await ghRequest(`${target.path}/${secretName}`, {
        method: 'PUT',
        body: JSON.stringify({
          key_id: publicKeyInfo.key_id,
          encrypted_value: encryptedBase64
        })
      });

      console.log(`    ✅ ${secretName} -> synced`);
    } finally {
      secretBuffer.fill(0); // Zero out memory
    }
  }
}

console.log(`\n🎉 Secrets synchronized successfully!`);
