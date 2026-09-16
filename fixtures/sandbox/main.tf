terraform {
  required_version = "= 1.12.0"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "= 6.13.0"
    }
  }
  backend "s3" {}
}
provider "github" {
  owner = "archproof"
  app_auth {}
}
variable "disposable_prefix" {
  description = "Owner-approved unique fixture prefix, never a product repository name."
  type        = string
  validation {
    condition     = can(regex("^ap-gh02-sandbox-[a-z0-9]{8,16}$", var.disposable_prefix))
    error_message = "Use an explicitly disposable sandbox prefix."
  }
}
resource "github_repository" "fixture" {
  for_each           = toset(["public", "private", "template"])
  name               = "${var.disposable_prefix}-${each.key}"
  visibility         = each.key == "private" ? "private" : "public"
  auto_init          = true
  is_template        = each.key == "template"
  description        = "Disposable integration fixture; no product assets."
  archive_on_destroy = true
  lifecycle {
    prevent_destroy = true
  }
}
output "fixtures" {
  description = "Record actual IDs after approved fixture apply; not learner provisioning evidence."
  value       = { for key, repo in github_repository.fixture : key => { id = repo.repo_id, url = repo.html_url } }
}
