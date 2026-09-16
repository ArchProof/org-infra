output "repositories" {
  description = "Stable catalog identities; no contents or credentials."
  value = { for key, repo in github_repository.catalog : key => {
    id         = repo.repo_id
    url        = repo.html_url
    visibility = repo.visibility
  } }
}
