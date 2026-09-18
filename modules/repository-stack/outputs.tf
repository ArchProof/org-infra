output "name" {
  description = "Repository name."
  value       = module.repository.name
}

output "repo_id" {
  description = "Numeric GitHub repository ID."
  value       = module.repository.repo_id
}

output "html_url" {
  description = "Repository web URL."
  value       = module.repository.html_url
}

output "visibility" {
  description = "Configured repository visibility."
  value       = module.repository.visibility
}
