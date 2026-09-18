output "name" {
  description = "Repository name."
  value       = github_repository.this.name
}

output "repo_id" {
  description = "Numeric GitHub repository ID."
  value       = github_repository.this.repo_id
}

output "html_url" {
  description = "Repository web URL."
  value       = github_repository.this.html_url
}

output "visibility" {
  description = "Configured repository visibility."
  value       = github_repository.this.visibility
}
