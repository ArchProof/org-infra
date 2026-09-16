locals {
  catalog = jsondecode(file("${path.module}/catalog.json"))
}

variable "reviewer_ids" {
  description = "Verified numeric organization member IDs allowed to approve protected GitOps execution."
  type        = set(number)
  validation {
    condition     = length(var.reviewer_ids) > 0 && length(var.reviewer_ids) <= 6 && alltrue([for id in var.reviewer_ids : id > 0 && floor(id) == id])
    error_message = "Supply one to six positive numeric reviewer IDs."
  }
}

variable "single_owner" {
  description = "Explicitly record single-owner review; do not deadlock self-review."
  type        = bool
}

resource "github_repository" "catalog" {
  for_each               = local.catalog
  name                   = each.key
  visibility             = each.value.visibility
  is_template            = each.value.template
  auto_init              = true
  has_issues             = true
  has_projects           = false
  has_wiki               = false
  allow_merge_commit     = false
  allow_rebase_merge     = false
  allow_squash_merge     = true
  delete_branch_on_merge = true
  archive_on_destroy     = true
  lifecycle {
    prevent_destroy = true
  }
}

resource "github_repository_environment" "gitops" {
  repository          = github_repository.catalog["org-infra"].name
  environment         = "gitops"
  prevent_self_review = !var.single_owner
  can_admins_bypass   = false
  reviewers {
    users = var.reviewer_ids
  }
  deployment_branch_policy {
    protected_branches     = true
    custom_branch_policies = false
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "github_repository_ruleset" "public" {
  for_each    = { for key, repo in local.catalog : key => repo if repo.visibility == "public" }
  repository  = github_repository.catalog[each.key].name
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
    # Only require a check that is seeded in this slice. Product repositories
    # acquire their real checks with their reviewed content in slice 03.
    dynamic "required_status_checks" {
      for_each = each.key == "org-infra" ? [1] : []
      content {
        strict_required_status_checks_policy = true
        do_not_enforce_on_create             = false
        required_check {
          context = "gitops-validate"
        }
      }
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

output "repositories" {
  description = "Stable catalog identities; no contents or credentials."
  value = { for key, repo in github_repository.catalog : key => {
    id = repo.repo_id, url = repo.html_url, visibility = repo.visibility
  } }
}
