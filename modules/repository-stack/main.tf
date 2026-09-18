# Per-repository governance stack: repository + optional gitops-main branch
# ruleset + optional protected "gitops" deployment environment. Each
# organization repository declares exactly one instance of this module.
module "repository" {
  source      = "../repository"
  name        = var.name
  visibility  = var.visibility
  is_template = var.is_template
  auto_init   = var.auto_init
}

module "branch_ruleset" {
  source          = "../branch-ruleset"
  count           = var.manage_ruleset ? 1 : 0
  repository      = module.repository.name
  required_checks = var.required_checks
  single_owner    = var.single_owner
}

module "gitops_environment" {
  source       = "../deployment-environment"
  count        = var.manage_environment ? 1 : 0
  repository   = module.repository.name
  reviewer_ids = var.reviewer_ids
  single_owner = var.single_owner
}
