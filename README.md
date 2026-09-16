# GitHub GitOps bootstrap (AP-GH-01)

This directory is a clean, independently publishable candidate root for
`archproof/org-infra`. It does not import, initialize or mutate the old `src/`
Forgejo root. OpenTofu **1.12.0**, integrations/github **6.13.0**, Node **24.16.0**,
TFLint **0.61.0**. Provider checksums cover Windows and Linux AMD64. Dependencies
are locked; ordinary PR validation never receives governance or storage secrets.

## Current scope and authority

The catalog has seven stable keys: public org-infra, missions, workflows, actions,
kill-the-secrets (template); private platform and learner-state. Repository
contents are not OpenTofu resources, so reconciliation does not overwrite code.
Deletion/replacement, renaming and visibility changes are refused by plan policy;
resources also have `prevent_destroy`. Do not remove a resource block to bypass it.

OpenTofu owns the catalog settings, public main rulesets and `gitops` environment.
Bootstrap API writes establish only the initial imported org-infra baseline.
GitHub secrets use sealed-box encryption in a separate command; secret values
never enter HCL or tfvars. Governance keys never enter platform composition.
No learner hooks are created; their future secrets must be unique per repository.

There is no App bypass actor. Public main requires PRs and prevents force-push and
deletion. The real required check on org-infra is `gitops-validate`. Other public
repositories acquire their actual checks/CODEOWNERS with slice 03 content; no
invented product check is required today. CODEOWNERS for org-infra is generated
from verified owner/reviewer logins. Single-owner mode uses zero peer approvals,
allows self environment approval, and does not claim independent review. Multiple
reviewers enable independent review. Environment admin bypass is disabled.

Private GitHub Free repositories have **no claimed native ruleset/environment
enforcement**. Grant no additional writers to platform or learner-state at this
stage. Organization owners and installed Apps retain their inherent authority.
Before live acceptance, inventory org default permissions, members, teams,
collaborators and installations. A non-owner writer inherited from the organization
is a release blocker until a reviewed Git-owned policy can remove the grant.
Organization-wide default permissions/settings are deliberately not API-written:
the verified App does not have Organization Administration write. Record any
needed permission consent and resource ownership extension before changing them.

## Local validation

From this directory (use the pinned binary, not a different system tofu):

```powershell
npm --prefix tooling ci --ignore-scripts --no-audit --no-fund
node --test tooling/test/core.test.mjs
node tooling/cli.mjs validate
tofu fmt -check -recursive
tofu init -backend=false -lockfile=readonly
$env:GITHUB_APP_ID = '1'
$env:GITHUB_APP_INSTALLATION_ID = '1'
$env:GITHUB_APP_PEM_FILE = 'synthetic-validation-only'
tofu validate
Remove-Item Env:GITHUB_APP_ID,Env:GITHUB_APP_INSTALLATION_ID,Env:GITHUB_APP_PEM_FILE
tofu test
tflint --init
tflint
```

The three synthetic values satisfy the provider's validation schema. They are
not credentials and are never used for a live plan. The empty `app_auth` block
reads real authentication only in the protected runner. The runner refuses ambient
PAT/native token variables, owner overrides and debug flags. The narrow issue-only
job is the sole explicit native `GITHUB_TOKEN` use for mutation.

## Reviewable seed, then initial trust bootstrap

1. Complete `profile.example.json` into an ignored local profile, using verified
   numeric reviewer IDs and logins, explicit single-owner choice, fresh state keys,
   private bucket and reference names. No secret values or PEM paths belong in it.
   CI reference names are `GOVERNANCE_PEM_PATH`, `STATE_ACCESS_KEY`,
   `STATE_SECRET_KEY`; retain these names for the supplied workflows.
2. Commit the reviewed tooling subset. From the original checkout root:

   ```powershell
   node infra/github/tooling/cli.mjs prepare --profile '<PROFILE_PATH>' --commit '<EXACT_IMPLEMENTATION_SHA>' --output '<NEW_BUNDLE_PATH>'
   ```

   This uses committed bytes only from `infra/github/`, maps `seed/.github/` to
   `.github/`, adds the nonsecret profile and CODEOWNERS, and lists every file plus
   a SHA-256 digest. It copies no history or private platform sources. Inspect all
   decoded files before approving that exact digest. The bundle itself is not
   authorization. Changing any file/profile requires a new bundle and review.
3. Obtain owner approval for public seed content and initial org-infra API writes.
   Set `GOVERNANCE_PEM_PATH` to the explicitly protected absolute PEM path in the
   operator process; never echo it or use a cached GitHub CLI login. Then:

   ```powershell
   node infra/github/tooling/cli.mjs bootstrap --bundle '<BUNDLE_PATH>' --approved-digest '<APPROVED_SHA256>' --journal '<PROTECTED_NEW_JOURNAL_DIRECTORY>'
   ```

   App/installation numeric IDs, grants, owner and inventory are reverified live.
   Only org-infra can be created. Existing names require an explicit reviewed
   `--adopt-id`; a foreign/nonempty repo is refused. Never use name-only adoption.
   Journal `created.json` binds the returned repo ID to the seed digest. Unknown
   create outcomes require inventory/adoption review, never automatic POST retry.
   Git blobs/tree/commit/ref operations perform the first App-authenticated seed
   without a Git credential helper. A ref write is never forced. A seed marker
   and exact file hashes make resume read-only once the baseline exists.
4. The baseline receipt includes three import blocks: repository, environment and
   ruleset. Copy its `imports` object into reviewed `imports.tf.json`, and put the
   actual org-infra numeric ID in reviewed `adoptions.json`. Commit both via a PR.
   The authenticated plan must display these imports; do not run a separate
   unreviewed `tofu import` or overwrite state. Future adoption uses the same
   explicit ID + import-block review. Imported fields that differ are reviewed
   as changes, never silently accepted as an empty plan.
5. After the environment baseline is verified and owner approval covers secret
   synchronization, run `sync-secrets --profile <PROFILE> --references
   <REFERENCE_JSON>` with `node tooling/cli.mjs`. Each reference names an environment
   variable containing an absolute protected secret-file path. Secret names are
   restricted to `GOVERNANCE_PEM`, `STATE_ACCESS_KEY`, `STATE_SECRET_KEY` in the
   org-infra `gitops` environment. Raw bytes exist in memory only and are zeroed
   after encryption. The tool sends only sealed-box ciphertext to GitHub.

Do not run bootstrap again as a routine settings repair mechanism. Changed seed
content or changed imported policy must proceed through PR -> protected plan/apply.

## State proof and exact saved-plan apply

Production state must use a private B2 bucket and a fresh `github/...` key distinct
from the sandbox key. No legacy state migration, `-migrate-state`, force unlock,
or local production state. B2 Object Lock retention is not proof of conditional
mutual exclusion. Actual conditional writes and OpenTofu locking must pass.

`state-drill --state <STATE_CONFIG> --output <NEW_RECEIPT>` takes only the `state`
object from a profile. Credential references name process variables containing
the storage credentials. It uses random `github/probes/<nonce>/` objects, races
two conditional writes, tests lock reacquisition, restores one historical probe
object version, then proves that OpenTofu refuses a held lock while another key
can plan/apply and converge. After releasing the probe lock, the first key also
applies and converges. Only built-in `terraform_data` is applied. Probe state and
historical object versions are retained. No actual baseline state is rewound.
Set `TOFU_BINARY` to the absolute pinned executable if it is not on PATH.

For the owner-requested Docker MinIO sandbox use `kind: minio-sandbox`, an explicit
loopback endpoint, and a **new** `ap-gh01-sandbox-<unique>` bucket. The option
`--create-sandbox-bucket true` creates/version-enables only that new bucket;
existing buckets are never reconfigured. A MinIO receipt always records
`productionB2Verified: false`. It cannot unlock production GitHub apply.

Review and commit the real B2 receipt as `evidence/state-drill.json` before
protected plan/apply. It is bound to endpoint/bucket/keys and expires after seven
days; hashes are included in plan review metadata. No fixture receipt is shipped
at that path. Missing evidence intentionally blocks execution.

The protected workflow only runs on current main, after `gitops` approval. Dispatch
`plan` with its exact reviewed merged SHA. It checks live main again, validates
fresh state evidence and reviewed imports, saves a locked plan, and stores the
binary privately at `github/plans/<sha>/<digest>.plan`. The receipt is alongside it;
conditional writes refuse replacement. Public output is counts, SHA, digest and
a restricted S3 object location, never raw plan JSON. Configure bucket access and
lifecycle retention externally at initial storage trust setup; no public bucket
or public Actions artifact is an acceptable plan store.

Review private details, then dispatch `apply` with the **same current main SHA**
and saved-plan digest. Approve the environment for that action. No fresh plan is
generated during apply. SHA, plan bytes, profile, state-proof hash and 24-hour
expiry must match. OpenTofu locks state and rejects a stale saved plan. A partial
apply retains state; inspect private diagnostics, commit a forward fix if needed,
and review a new saved plan. Never reuse a stale plan or replace resources to retry.

Scheduled drift also waits for the protected environment reviewer. This is an
intentional approval requirement, not unattended drift coverage. It never applies.
A separate native-token issue job opens/updates one bot-owned marker issue on
changes/errors, closes duplicates, and closes it after a clean plan. Workflow
concurrency serializes issue reconciliation. Missing approval means observation
has not run; monitor pending runs operationally.

## Additional Apps and disposable capability fixtures

`apps/governance.json` records the existing registration; it must never be
recreated. Fill learning HTTPS OAuth/setup/App webhook URLs in a reviewed copy of
`apps/learning.json`. Keep public installation availability and the declared
permissions. State-writer has only Metadata read + Contents write and is private.
Separate development registrations/credentials from production.

Compute SHA-256 over `JSON.stringify(parsedManifest)` and obtain owner approval,
then run `manifest-consent --manifest <JSON> --approved-digest <SHA256>
--protected-output <ABSOLUTE_NEW_SECRET_FILE>` through the CLI. It binds loopback
port 8765 for ten minutes, shows a GitHub owner confirmation form, checks one-time
state, and converts the code directly into a protected output file outside the
checkout. The owner must ensure the destination directory has restrictive ACLs
on Windows; POSIX creates mode 0600. Credentials never reach the browser/logs.
If conversion succeeds but secure storage fails, recover/revoke through the
recorded owner App trust boundary; do not repeat registration blindly.

App manifest installation scope is not enforceable in the registration manifest.
Owner consent must select **learner-state only** for state-writer. Record actual
App/installation IDs and verify `repository_selection=selected` and the exact
learner-state numeric repo ID using that App before giving its key to any service.
This remains a live gate; no current state-writer installation is claimed.

`fixtures/sandbox/` declares public, private and public-template repositories under
an explicitly approved `ap-gh02-sandbox-<unique>` prefix. Its contents are only an
auto-generated README, with no unfinished product assets. Initialize it with a
separate sandbox backend and App environment credentials; review its saved plan
before approved apply. Record actual IDs and verify privacy. No fixture repositories
have been created by this implementation. Slice 02 uses those IDs after approval.

## Outstanding live acceptance and recovery

Before declaring AP-GH-01 live-verified: approve/seed/import org-infra; verify B2
mutual exclusion/recovery; verify environment review and required check reports;
apply the reviewed catalog/fixture plans; require empty repeat plans; test denied
direct push to a disposable protected public branch; verify actual private
visibility/writers; demonstrate drift issue convergence and failed apply recovery.
App registration/installation consent remains owner controlled. A synthetic test
is not a GitHub run, and a MinIO probe is not B2 evidence.

Recover forward through reviewed Git. Keep journals, private saved plans and
state versions. Retain all old Forgejo resources/configuration/state. No destroy
command or public content publication is performed by local validation.

References: [provider App authentication](https://raw.githubusercontent.com/integrations/terraform-provider-github/v6.13.0/docs/index.md),
[ruleset schema](https://raw.githubusercontent.com/integrations/terraform-provider-github/v6.13.0/docs/resources/repository_ruleset.md),
[OpenTofu S3 locking](https://opentofu.org/docs/language/settings/backends/s3/).
