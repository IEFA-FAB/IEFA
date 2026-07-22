# ---- Remote state of the foundation stack ----
variable "state_bucket" {
  description = "S3 bucket holding Terraform remote state (from infra/bootstrap)."
  type        = string
}

variable "state_region" {
  description = "Region of the state bucket."
  type        = string
  default     = "sa-east-1"
}

variable "foundation_state_key" {
  description = "State key of the foundation stack."
  type        = string
  default     = "foundation/prod/terraform.tfstate"
}

variable "aws_region" {
  description = "Region for the origin bucket (must match the foundation region). The CloudFront certificate is pinned to us-east-1 separately — that is an AWS constraint, not a choice."
  type        = string
  default     = "sa-east-1"
}

variable "allowed_account_ids" {
  description = "AWS account IDs Terraform may operate on. Guards against applying to the wrong account."
  type        = list(string)
  default     = ["103256050857"]
}

# ---- Site definition ----
variable "site_name" {
  description = "Site key = bucket suffix and CloudFront comment."
  type        = string
}

variable "hosts" {
  description = "Hostnames served by the distribution. Ignored until certificate_arn is set."
  type        = list(string)
  default     = []
}

variable "provision_certificate" {
  description = "Create a us-east-1 certificate for `hosts`. Validation records must be added by hand at Registro.br — see the bring-up order in main.tf."
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "ARN of an ISSUED us-east-1 certificate covering `hosts`. Empty keeps the distribution on the default CloudFront domain."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "Keep PriceClass_All. PriceClass_100/200 exclude South America, which would push Brazilian visitors to a North American edge and make the site slower than the ALB it replaces."
  type        = string
  default     = "PriceClass_All"
}
