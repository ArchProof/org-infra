# ArchProof Organization Infrastructure (org-infra)

This repository manages GitHub organization repositories, rulesets, and environments for `ArchProof` using pure **OpenTofu** GitOps.

## Scope & Principles

- **OpenTofu 1.12.0** with `integrations/github` provider pinned to **6.13.0**.
- **Repository Modules**: Each organization repository is an explicit `module` block in `main.tf`, composed from `modules/repository-stack` (repository + optional `gitops-main` branch ruleset + optional protected `gitops` environment). Adding a repository means adding one module block.
- **Protected Branch Rules**: Enforced on each public repository that opts in via `manage_ruleset = true` (`gitops-main` ruleset) with per-repository `required_checks`. GitHub Free only allows rulesets on public repositories.
- **Environment Protections**: Deployments to the `gitops` environment require review from verified organization members declared in `variables.tf`.
- **Zero Ambiguous Retries / Protection against accidental destruction**: All managed repositories, rulesets, and environments enforce `prevent_destroy = true`.

---

## Adding a Repository

Append one module block to `main.tf` and open a PR; the speculative plan previews it before the protected apply:

```hcl
module "my_new_repo" {
  source          = "./modules/repository-stack"
  name            = "my-new-repo"
  visibility      = "public"
  manage_ruleset  = true
  required_checks = ["ci"] # only checks that already run on the repo's PRs
  single_owner    = var.single_owner
}
```

`manage_environment = true` additionally manages the protected `gitops` deployment environment (public repositories only under GitHub Free). Repositories, rulesets, and environments are guarded by `prevent_destroy`; removing a managed object always requires explicitly relaxing that guard in a reviewed change.

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

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_actions"></a> [actions](#module\_actions) | ./modules/repository-stack | n/a |
| <a name="module_kill_the_secrets"></a> [kill\_the\_secrets](#module\_kill\_the\_secrets) | ./modules/repository-stack | n/a |
| <a name="module_learner_state"></a> [learner\_state](#module\_learner\_state) | ./modules/repository-stack | n/a |
| <a name="module_maf_intro"></a> [maf\_intro](#module\_maf\_intro) | ./modules/repository-stack | n/a |
| <a name="module_missions"></a> [missions](#module\_missions) | ./modules/repository-stack | n/a |
| <a name="module_org_infra"></a> [org\_infra](#module\_org\_infra) | ./modules/repository-stack | n/a |
| <a name="module_platform"></a> [platform](#module\_platform) | ./modules/repository-stack | n/a |
| <a name="module_workflows"></a> [workflows](#module\_workflows) | ./modules/repository-stack | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_reviewer_ids"></a> [reviewer\_ids](#input\_reviewer\_ids) | Verified numeric organization member IDs allowed to approve protected GitOps execution. | `set(number)` | n/a | yes |
| <a name="input_single_owner"></a> [single\_owner](#input\_single\_owner) | Explicitly record single-owner review; do not deadlock self-review. | `bool` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_repositories"></a> [repositories](#output\_repositories) | Stable repository identities; no contents or credentials. |
<!-- END_TF_DOCS -->
