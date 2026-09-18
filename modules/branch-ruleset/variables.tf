variable "repository" {
  description = "Name of the repository the ruleset applies to."
  type        = string
}

variable "required_checks" {
  description = "Status checks that must pass before merging into the default branch."
  type        = list(string)
  default     = []
}

variable "single_owner" {
  description = "Explicitly record single-owner review; do not deadlock self-review."
  type        = bool
}
