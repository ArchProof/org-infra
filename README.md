# ArchProof Organization Infrastructure (org-infra)

This repository manages GitHub organization repositories, rulesets, and environments for `ArchProof` using pure **OpenTofu** GitOps.

## Scope & Principles

- **OpenTofu 1.12.0** with `integrations/github` provider pinned to **6.13.0**.
- **Organization Catalog**: Declared in `catalog.json` covering the stable repository keys (`org-infra`, `missions`, `workflows`, `actions`, `kill-the-secrets`, `platform`, `learner-state`).
- **Protected Branch Rules**: Enforced automatically on all public repositories (`gitops-main` ruleset).
- **Environment Protections**: Deployments to the `gitops` environment require review from verified organization members declared in `variables.tf`.
- **Zero Ambiguous Retries / Protection against accidental destruction**: All managed repositories and rulesets enforce `prevent_destroy = true`.

---

## Local Validation

```powershell
tofu fmt -check -recursive
tofu init -backend=false -lockfile=readonly
$env:GITHUB_APP_ID = '1'
$env:GITHUB_APP_INSTALLATION_ID = '1'
$env:GITHUB_APP_PEM_FILE = 'synthetic-validation-only'
tofu validate
Remove-Item Env:GITHUB_APP_ID,Env:GITHUB_APP_INSTALLATION_ID,Env:GITHUB_APP_PEM_FILE
```

---

## Secret Synchronization & Setup for a New Organization

This repository is self-contained. Sensitive storage URLs and buckets are never committed to Git and are instead injected from GitHub Secrets at runtime.

### 1. Configure Secret References
Copy the example references file:
```powershell
cp secret-references.example.json secret-references.json
```

Set environment variables pointing to your credentials or files:
```powershell
$env:GOVERNANCE_PEM_PATH   = "C:\keys\app.pem"
$env:STATE_ACCESS_KEY_FILE = "C:\keys\access_key.txt"
$env:STATE_SECRET_KEY_FILE = "C:\keys\secret_key.txt"
$env:STATE_ENDPOINT_FILE   = "C:\keys\endpoint.txt"   # contains: https://...storage.c-6...neon.tech
$env:STATE_BUCKET_FILE     = "C:\keys\bucket.txt"     # contains: uploads
```

### 2. Synchronize Secrets to GitHub (via GitHub CLI)
Ensure `gh` CLI is installed and authenticated (`gh auth login` or `$env:GH_TOKEN`), then run:

**On Windows PowerShell:**
```powershell
./scripts/sync-secrets-gh.ps1
```

**On Linux / macOS Bash:**
```bash
chmod +x ./scripts/sync-secrets-gh.sh
./scripts/sync-secrets-gh.sh
```
*(Zero Node.js runtime or npm dependencies required — uses native `gh` CLI).*

---

## Versioning & Milestone Releases

This repository uses **Google Release-Please** for automated Semantic Versioning driven by Conventional Commits (`feat:`, `fix:`, `chore:`, `BREAKING CHANGE:`).

1. **Automated Release PR**: Pushes to `main` evaluate commit messages and update or open a pending Release PR containing an updated `CHANGELOG.md` and bumped SemVer tag.
2. **App-Authenticated Branch Protection**: The workflow utilizes the Governance GitHub App (`appId` from `profile.json` or `vars.RELEASE_APP_ID`) to open the PR, ensuring the required `gitops-validate` branch ruleset check triggers and passes.
3. **Milestone Audit Snapshots**: When a release is published, `.github/workflows/release-milestone.yml` automatically snapshots the milestone:
   - Calculates deterministic SHA256 checksums of `catalog.json`, `profile.json`, and `.terraform.lock.hcl`.
   - Generates a structured `audit-manifest-vX.Y.Z.json`.
   - Uploads the audit record directly to the GitHub Release assets, turning releases into an immutable historical record of what was actually governed and deployed.

---

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | = 1.12.0 |
| <a name="requirement_github"></a> [github](#requirement\_github) | = 6.13.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_github"></a> [github](#provider\_github) | 6.13.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [github_repository.catalog](https://registry.terraform.io/providers/integrations/github/6.13.0/docs/resources/repository) | resource |
| [github_repository_environment.gitops](https://registry.terraform.io/providers/integrations/github/6.13.0/docs/resources/repository_environment) | resource |
| [github_repository_ruleset.public](https://registry.terraform.io/providers/integrations/github/6.13.0/docs/resources/repository_ruleset) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_reviewer_ids"></a> [reviewer\_ids](#input\_reviewer\_ids) | Verified numeric organization member IDs allowed to approve protected GitOps execution. | `set(number)` | n/a | yes |
| <a name="input_single_owner"></a> [single\_owner](#input\_single\_owner) | Explicitly record single-owner review; do not deadlock self-review. | `bool` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_repositories"></a> [repositories](#output\_repositories) | Stable catalog identities; no contents or credentials. |
<!-- END_TF_DOCS -->
