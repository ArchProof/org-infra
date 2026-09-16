terraform {
  required_version = "= 1.12.0"
  backend "s3" {}
}
resource "terraform_data" "probe" {
  input = "ap-gh-01-independent-state"
}
