#!/usr/bin/env node
/**
 * Secret Synchronization Tool for org-infra using GitHub CLI (gh)
 *
 * Automatically sets Repository and Environment secrets using the native `gh` CLI.
 * Requires: GitHub CLI installed and authenticated (or GH_TOKEN environment variable).
 *
 * Usage:
 *   node scripts/sync-secrets.mjs [--profile profile.json] [--references secret-references.json]
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Verify GitHub CLI is installed
try {
  execFileSync('gh', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('❌ GitHub CLI (gh) is not found in PATH.');
  console.error('👉 Install it from https://cli.github.com/ or run: winget install GitHub.cli');
  process.exit(1);
}

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const profilePath = getArg('--profile', existsSync('profile.local.json') ? 'profile.local.json' : 'profile.json');
const referencesPath = getArg('--references', existsSync('secret-references.json') ? 'secret-references.json' : 'secret-references.example.json');

console.log(`\n🔒 ArchProof GitOps Secret Synchronizer (GitHub CLI)`);
console.log(`----------------------------------------------------`);
console.log(`Profile:    ${profilePath}`);
console.log(`References: ${referencesPath}\n`);

// 1. Read Profile
let profile = {};
if (existsSync(profilePath)) {
  try {
    profile = JSON.parse(await readFile(profilePath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ Could not parse ${profilePath}: ${err.message}`);
  }
}
const repo = getArg('--repo', `${profile.organization || 'ArchProof'}/org-infra`);

// 2. Read References
let references = {};
try {
  references = JSON.parse(await readFile(referencesPath, 'utf8'));
} catch (err) {
  console.error(`❌ Could not read references file at ${referencesPath}:`, err.message);
  process.exit(1);
}

console.log(`Target Repository: ${repo}`);

// 3. Collect secret values from environment variables or files
const secretsToSync = {};
for (const [secretName, envVarOrValue] of Object.entries(references)) {
  const ref = process.env[envVarOrValue] || process.env[secretName] || envVarOrValue;

  let secretValue = null;
  if (ref && existsSync(ref)) {
    secretValue = (await readFile(ref, 'utf8')).trim();
  } else if (process.env[envVarOrValue]) {
    secretValue = process.env[envVarOrValue].trim();
  } else if (process.env[secretName]) {
    secretValue = process.env[secretName].trim();
  }

  if (secretValue) {
    secretsToSync[secretName] = secretValue;
  } else {
    console.warn(`⚠️  Skipping ${secretName}: no value found in env var "${envVarOrValue}" or file.`);
  }
}

if (Object.keys(secretsToSync).length === 0) {
  console.error('\n❌ No secrets found to synchronize. Populate environment variables or files.');
  process.exit(1);
}

// 4. Set Repository Secrets via `gh secret set`
console.log('\n📤 Uploading Repository Secrets...');
for (const [name, val] of Object.entries(secretsToSync)) {
  try {
    execFileSync('gh', ['secret', 'set', name, '--body', val, '-R', repo], { stdio: 'pipe' });
    console.log(`  ✅ ${name} -> set (repository)`);
  } catch (err) {
    console.error(`  ❌ Failed to set ${name}:`, err.stderr?.toString() || err.message);
  }
}

// 5. Also sync to environments for strict isolation
for (const envName of ['gitops', 'gitops-plan']) {
  console.log(`\n📤 Uploading to Environment [${envName}]...`);
  for (const [name, val] of Object.entries(secretsToSync)) {
    try {
      execFileSync('gh', ['secret', 'set', name, '--body', val, '-R', repo, '--env', envName], { stdio: 'pipe' });
      console.log(`  ✅ ${name} -> set (${envName})`);
    } catch {
      // Environments may not exist yet if not bootstrapped; continue
    }
  }
}

console.log(`\n🎉 All secrets synchronized successfully using GitHub CLI!`);
console.log(`Current Repository Secrets in ${repo}:`);
try {
  const list = execFileSync('gh', ['secret', 'list', '-R', repo], { encoding: 'utf8' });
  console.log(list);
} catch {}
