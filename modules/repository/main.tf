# A single organization repository with the ArchProof baseline settings.
# Catalog membership is the record of what must exist, so destruction is
# never planned from code changes alone.
resource "github_repository" "this" {
  name                   = var.name
  visibility             = var.visibility
  is_template            = var.is_template
  auto_init              = var.auto_init
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
