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
