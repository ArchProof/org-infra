mock_provider "github" {}

variables {
  reviewer_ids = [1234]
  single_owner = true
}

run "catalog_contract" {
  command = plan
  assert {
    condition     = length(github_repository.catalog) == 7
    error_message = "Exactly seven stable repository keys are required."
  }
  assert {
    condition     = github_repository.catalog["platform"].visibility == "private" && github_repository.catalog["learner-state"].visibility == "private"
    error_message = "Private control-plane and intent repositories must remain private."
  }
  assert {
    condition     = length(github_repository_ruleset.public) == 5 && !github_repository_environment.gitops.prevent_self_review
    error_message = "Free-plan protections apply to public repos; a single owner must be able to approve."
  }
}

run "independent_review" {
  command = plan
  variables {
    single_owner = false
  }
  assert {
    condition     = github_repository_environment.gitops.prevent_self_review
    error_message = "Independent review must prevent self-approval."
  }
}
