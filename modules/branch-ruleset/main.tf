# Enforces the shared "gitops-main" branch ruleset on one repository, with
# per-repository required status checks. GitHub Free only allows rulesets on
# public repositories; declare this module for public repositories only.
resource "github_repository_ruleset" "this" {
  repository  = var.repository
  name        = "gitops-main"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true

    pull_request {
      required_approving_review_count   = var.single_owner ? 0 : 1
      require_code_owner_review         = !var.single_owner
      require_last_push_approval        = !var.single_owner
      dismiss_stale_reviews_on_push     = true
      required_review_thread_resolution = true
    }

    # Only name checks that already run in the repository's pull requests,
    # otherwise merges block forever.
    dynamic "required_status_checks" {
      for_each = length(var.required_checks) > 0 ? [1] : []
      content {
        strict_required_status_checks_policy = true
        do_not_enforce_on_create             = false

        dynamic "required_check" {
          for_each = var.required_checks
          content {
            context = required_check.value
          }
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
