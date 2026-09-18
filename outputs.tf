output "repositories" {
  description = "Stable repository identities; no contents or credentials."
  value = {
    "org-infra" = {
      id         = module.org_infra.repo_id
      url        = module.org_infra.html_url
      visibility = module.org_infra.visibility
    }
    "platform" = {
      id         = module.platform.repo_id
      url        = module.platform.html_url
      visibility = module.platform.visibility
    }
    "missions" = {
      id         = module.missions.repo_id
      url        = module.missions.html_url
      visibility = module.missions.visibility
    }
    "workflows" = {
      id         = module.workflows.repo_id
      url        = module.workflows.html_url
      visibility = module.workflows.visibility
    }
    "actions" = {
      id         = module.actions.repo_id
      url        = module.actions.html_url
      visibility = module.actions.visibility
    }
    "kill-the-secrets" = {
      id         = module.kill_the_secrets.repo_id
      url        = module.kill_the_secrets.html_url
      visibility = module.kill_the_secrets.visibility
    }
    "maf-intro" = {
      id         = module.maf_intro.repo_id
      url        = module.maf_intro.html_url
      visibility = module.maf_intro.visibility
    }
    "learner-state" = {
      id         = module.learner_state.repo_id
      url        = module.learner_state.html_url
      visibility = module.learner_state.visibility
    }
  }
}
