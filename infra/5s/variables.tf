# Per-service stack variables. Service-specific values live in terraform.tfvars
# (copy terraform.tfvars.example). This file is identical across every service
# stack — only the .tfvars, backend, and secrets differ.

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
  description = "AWS region for this service (must match the foundation region)."
  type        = string
  default     = "sa-east-1"
}

variable "allowed_account_ids" {
  description = "AWS account IDs Terraform may operate on. Guards against applying to the wrong account."
  type        = list(string)
  default     = ["103256050857"]
}

# ---- Service definition ----
variable "service_name" {
  type = string
}

variable "docker_target" {
  type = string
}

variable "container_port" {
  type = number
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "health_check_path" {
  type    = string
  default = "/health"
}

variable "listener_priority" {
  type = number
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "secret_names" {
  type    = list(string)
  default = []
}

variable "hosts" {
  description = "Host headers routed to this service by the shared ALB."
  type        = list(string)
  default     = []
}

variable "path_patterns" {
  type    = list(string)
  default = []
}

# ---- Runtime / rollout knobs ----
variable "image_tag" {
  type    = string
  default = "latest"
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "fargate_on_demand_base" {
  description = "Minimum tasks pinned to on-demand FARGATE (survives Spot reclamation). Set 1 for user-facing services."
  type        = number
  default     = 0
}

variable "fargate_on_demand_weight" {
  type    = number
  default = 0
}

variable "assign_public_ip" {
  type    = bool
  default = true
}

variable "enable_cloudwatch_logs" {
  type    = bool
  default = false
}

variable "cloudwatch_log_retention_days" {
  type    = number
  default = 14
}

variable "image_tag_mutability" {
  type    = string
  default = "MUTABLE"
}
