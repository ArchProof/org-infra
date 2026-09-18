variable "name" {
  description = "Repository name as it appears in the organization."
  type        = string
}

variable "visibility" {
  description = "Repository visibility. GitHub Free only enforces rulesets and environment reviewers on public repositories."
  type        = string
  default     = "private"
}

variable "is_template" {
  description = "Whether the repository is an organization template."
  type        = bool
  default     = false
}

variable "auto_init" {
  description = "Seed the repository with an initial commit on creation. Leave false when pushing existing history: the gitops-main ruleset forbids non-fast-forward updates of the default branch."
  type        = bool
  default     = false
}

variable "manage_ruleset" {
  description = "Manage the gitops-main branch ruleset for this repository. Only valid for public repositories under GitHub Free."
  type        = bool
  default     = false
}

variable "required_checks" {
  description = "Status checks required before merging into the default branch. Only name checks that already run on the repository's pull requests."
  type        = list(string)
  default     = []
}

variable "manage_environment" {
  description = "Manage the protected gitops deployment environment for this repository."
  type        = bool
  default     = false
}

variable "reviewer_ids" {
  description = "Numeric GitHub user IDs required to approve protected deployments."
  type        = set(number)
  default     = []
}

variable "single_owner" {
  description = "Explicitly record single-owner review; do not deadlock self-review."
  type        = bool
}
