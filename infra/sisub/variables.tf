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
  description = "AWS region for the ECS stack."
  type        = string
  default     = "sa-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
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

variable "default_image_tag" {
  description = "Default ECR image tag used by all services."
  type        = string
  default     = "latest"
}

variable "image_tags" {
  description = "Optional image tag override per service."
  type        = map(string)
  default     = {}
}

variable "desired_count" {
  description = "Default number of tasks per service. Two gives each service a duplicate task."
  type        = number
  default     = 2
}

variable "fargate_spot_weight" {
  description = "Weight for FARGATE_SPOT in each ECS service capacity provider strategy."
  type        = number
  default     = 1
}

variable "fargate_on_demand_weight" {
  description = "Optional FARGATE on-demand weight. Keep 0 for spot-only cost optimization."
  type        = number
  default     = 0
}

variable "assign_public_ip" {
  description = "Assign public IPs to tasks. This avoids NAT Gateway cost; security groups only allow inbound from ALB."
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN. When empty, ALB serves HTTP only."
  type        = string
  default     = ""
}

variable "root_domain" {
  description = "Optional base domain. When set, services get service.root_domain host rules."
  type        = string
  default     = ""
}

variable "service_domains" {
  description = "Additional hostnames per service, for example { sisub = [\"sisub.example.com\"] }."
  type        = map(list(string))
  default     = {}
}

variable "route53_zone_id" {
  description = "Optional Route53 hosted zone id for ALB alias records."
  type        = string
  default     = ""
}

variable "default_service_name" {
  description = "Service receiving ALB traffic when no host rule matches."
  type        = string
  default     = "portal"
}

variable "service_environment_overrides" {
  description = "Plain environment variable overrides per service. Do not put secrets here."
  type        = map(map(string))
  default     = {}
}

variable "service_extra_secret_names" {
  description = "Extra JSON keys to expose from each service Secrets Manager secret."
  type        = map(list(string))
  default     = {}
}

variable "secrets_kms_key_arn" {
  description = "Optional KMS key ARN used by Secrets Manager secrets."
  type        = string
  default     = ""
}

variable "task_role_policy_json" {
  description = "Optional extra IAM policy JSON attached to the shared ECS task role."
  type        = string
  default     = ""
}

variable "enable_cloudwatch_logs" {
  description = "Create CloudWatch log groups and attach awslogs config. Disabled by default to keep cost minimal."
  type        = bool
  default     = false
}

variable "cloudwatch_log_retention_days" {
  description = "Retention for optional CloudWatch logs."
  type        = number
  default     = 1
}

variable "ecr_scan_on_push" {
  description = "Enable basic ECR scan on push."
  type        = bool
  default     = true
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
