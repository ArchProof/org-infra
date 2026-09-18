variable "name" {
  description = "Repository name as it appears in the organization."
  type        = string
}

variable "visibility" {
  description = "Repository visibility. GitHub Free only enforces rulesets and environment reviewers on public repositories."
  type        = string
  default     = "private"

  validation {
    condition     = contains(["public", "private"], var.visibility)
    error_message = "visibility must be either \"public\" or \"private\"."
  }
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
