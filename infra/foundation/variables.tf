variable "project" {
  description = "Project prefix used in AWS resource names."
  type        = string
  default     = "iefa"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for the shared platform."
  type        = string
  default     = "sa-east-1"
}

variable "allowed_account_ids" {
  description = "AWS account IDs Terraform may operate on. Guards against applying to the wrong account."
  type        = list(string)
  default     = ["103256050857"]
}

variable "vpc_cidr" {
  description = "CIDR block for the shared VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones. Keep 2 for low cost and redundancy."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN. When empty, the ALB serves HTTP only."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Optional Route53 hosted zone id, exported for per-service alias records."
  type        = string
  default     = ""
}

variable "provision_certificate" {
  description = "Create a DNS-validated ACM certificate. Add the emitted validation CNAMEs at the DNS provider, then set certificate_arn to the issued cert."
  type        = bool
  default     = false
}

variable "acm_certificate_primary_domain" {
  description = "Primary domain for the ACM certificate."
  type        = string
  default     = "*.iefa.com.br"
}

variable "acm_certificate_sans" {
  description = "Subject alternative names for the ACM certificate."
  type        = list(string)
  default     = ["iefa.com.br", "app.previsaosisub.com.br"]
}

variable "secrets_kms_key_arn" {
  description = "Optional KMS key ARN used by the per-service Secrets Manager secrets. When set, the execution role is granted kms:Decrypt on it."
  type        = string
  default     = ""
}

variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights on the ECS cluster. Recommended for debugging Spot task failures; adds a small CloudWatch cost."
  type        = bool
  default     = true
}

variable "task_role_policy_json" {
  description = "Optional extra IAM policy JSON attached to the shared ECS task role."
  type        = string
  default     = ""
}

variable "enable_bedrock_task_access" {
  description = "Grant the shared ECS task role permission to invoke AWS Bedrock models (Converse/InvokeModel). Used by the @iefa/ai-provider bedrock adapter (sisub, sucont) — keyless via the task role. Opt-in: set true in terraform.tfvars to avoid inadvertent privilege expansion for services that don't use AI."
  type        = bool
  default     = false
}

variable "bedrock_regions" {
  description = "Regions whose Bedrock foundation models / inference profiles the task role may invoke."
  type        = list(string)
  default     = ["us-east-1", "us-west-2", "sa-east-1"]
}

variable "tags" {
  description = "Additional tags."
  type        = map(string)
  default     = {}
}

# ----- CI/CD (GitHub Actions OIDC) -----

variable "enable_github_deploy_role" {
  description = "Create the GitHub Actions OIDC deploy role (ECR push + ECS deploy)."
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as owner/name."
  type        = string
  default     = "IEFA-FAB/IEFA"
}

variable "github_oidc_provider_arn" {
  description = "ARN of an existing GitHub OIDC provider. When empty, one is created (AWS allows a single provider per account for this URL)."
  type        = string
  default     = ""
}

variable "github_deploy_subject_refs" {
  description = "OIDC `sub` refs allowed to assume the deploy role, appended to repo:<owner>/<name>:. Defaults to the main branch only."
  type        = list(string)
  default     = ["ref:refs/heads/main"]
}
