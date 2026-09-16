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

# Only GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID and GITHUB_APP_PEM_FILE
# supplied by the protected runner. No token variable or CLI fallback.
provider "github" {
  owner = "archproof"
  app_auth {}
}
