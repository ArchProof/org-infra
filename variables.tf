variable "reviewer_ids" {
  description = "Verified numeric organization member IDs allowed to approve protected GitOps execution."
  type        = set(number)
  validation {
    condition     = length(var.reviewer_ids) > 0 && length(var.reviewer_ids) <= 6 && alltrue([for id in var.reviewer_ids : id > 0 && floor(id) == id])
    error_message = "Supply one to six positive numeric reviewer IDs."
  }
}

variable "single_owner" {
  description = "Explicitly record single-owner review; do not deadlock self-review."
  type        = bool
}
