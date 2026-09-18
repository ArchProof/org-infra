variable "repository" {
  description = "Name of the repository the environment applies to."
  type        = string
}

variable "reviewer_ids" {
  description = "Numeric GitHub user IDs required to approve protected deployments."
  type        = set(number)
}

variable "single_owner" {
  description = "Explicitly record single-owner review; do not deadlock self-review."
  type        = bool
}
