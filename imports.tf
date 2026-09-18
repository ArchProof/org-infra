# One-time imports for the repository-stack refactor. The pre-refactor state
# remains preserved under the previous backend key. org-infra cannot be
# recreated by apply because this pipeline runs inside it, and its gitops
# environment must be adopted rather than recreated. Delete this file once
# the migration apply has converged.
import {
  to = module.org_infra.module.repository.github_repository.this
  id = "org-infra"
}

import {
  to = module.org_infra.module.branch_ruleset[0].github_repository_ruleset.this
  id = "org-infra:23558841"
}

import {
  to = module.org_infra.module.gitops_environment[0].github_repository_environment.this
  id = "org-infra:gitops"
}
