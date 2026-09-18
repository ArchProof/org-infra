# Each organization repository is an explicit module instance so per-repo
# governance (required status checks, protected environment) lives in
# reviewable HCL rather than in name-based conditionals.
module "org_infra" {
  source             = "./modules/repository-stack"
  name               = "org-infra"
  visibility         = "public"
  manage_ruleset     = true
  required_checks    = ["gitops-validate", "gitops-plan"]
  manage_environment = true
  reviewer_ids       = var.reviewer_ids
  single_owner       = var.single_owner
}

module "platform" {
  source       = "./modules/repository-stack"
  name         = "platform"
  visibility   = "private"
  single_owner = var.single_owner
}

module "missions" {
  source         = "./modules/repository-stack"
  name           = "missions"
  visibility     = "public"
  manage_ruleset = true
  single_owner   = var.single_owner
}

module "workflows" {
  source         = "./modules/repository-stack"
  name           = "workflows"
  visibility     = "public"
  manage_ruleset = true
  single_owner   = var.single_owner
}

module "actions" {
  source         = "./modules/repository-stack"
  name           = "actions"
  visibility     = "public"
  manage_ruleset = true
  single_owner   = var.single_owner
}

module "kill_the_secrets" {
  source         = "./modules/repository-stack"
  name           = "kill-the-secrets"
  visibility     = "public"
  is_template    = true
  manage_ruleset = true
  single_owner   = var.single_owner
}

module "maf_intro" {
  source         = "./modules/repository-stack"
  name           = "maf-intro"
  visibility     = "public"
  is_template    = true
  manage_ruleset = true
  single_owner   = var.single_owner
}

module "learner_state" {
  source       = "./modules/repository-stack"
  name         = "learner-state"
  visibility   = "private"
  single_owner = var.single_owner
}
