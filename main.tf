locals {
  catalog = jsondecode(file("${path.module}/catalog.json"))
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
  allow_auto_merge       = true
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
        required_check {
          context = "gitops-plan"
        }
      }
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}
