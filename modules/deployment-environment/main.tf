# The "gitops" deployment environment gating protected applies on one
# repository. Required reviewers and other deployment protection rules are
# only available on public repositories under GitHub Free.
resource "github_repository_environment" "this" {
  repository          = var.repository
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
