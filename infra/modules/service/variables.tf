# ---- Platform inputs (from the foundation stack remote state) ----

variable "aws_region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "listener_arn" {
  description = "ARN of the shared ALB application listener."
  type        = string
}

variable "alb_security_group_id" {
  type = string
}

variable "tasks_security_group_id" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "alb_dns_name" {
  type    = string
  default = ""
}

variable "alb_zone_id" {
  type    = string
  default = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

# ---- Service config ----

variable "service_name" {
  description = "Service key = ECS service name, ECR repo suffix, docker-bake target-ish key."
  type        = string
}

variable "docker_target" {
  description = "Dockerfile/bake target for this service (informational; the image is built in CI)."
  type        = string
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
  description = "Priority of the ALB host/path listener rule. Must be unique across services on the shared listener."
  type        = number
}

variable "hosts" {
  description = "Host headers routed to this service. Required (with a certificate) to reach the service; empty means only path_patterns route to it."
  type        = list(string)
  default     = []
}

variable "path_patterns" {
  description = "Optional path patterns routed to this service, e.g. [\"/api/*\"]. Used when hosts is empty."
  type        = list(string)
  default     = []
}

variable "environment_variables" {
  description = "Plain (non-secret) environment variables."
  type        = map(string)
  default     = {}
}

variable "secret_names" {
  description = "JSON keys to expose from this service's Secrets Manager secret as container secrets."
  type        = list(string)
  default     = []
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "fargate_spot_weight" {
  type    = number
  default = 1
}

variable "fargate_on_demand_weight" {
  description = "On-demand FARGATE weight. Set base=1 via fargate_on_demand_base for a guaranteed non-spot task on user-facing services."
  type        = number
  default     = 0
}

variable "fargate_on_demand_base" {
  description = "Minimum number of tasks pinned to on-demand FARGATE (survives a Spot capacity reclamation). 0 = spot-only."
  type        = number
  default     = 0
}

variable "assign_public_ip" {
  type    = bool
  default = true
}

variable "health_check_grace_period_seconds" {
  description = "Grace period before health checks can fail a task. Higher tolerates Spot cold start + internet image pull."
  type        = number
  default     = 120
}

variable "deployment_minimum_healthy_percent" {
  type    = number
  default = 100
}

variable "deployment_maximum_percent" {
  type    = number
  default = 200
}

variable "enable_cloudwatch_logs" {
  description = "Create a CloudWatch log group and stream container logs to it."
  type        = bool
  default     = false
}

variable "cloudwatch_log_retention_days" {
  type    = number
  default = 14
}

variable "ecr_scan_on_push" {
  type    = bool
  default = true
}

variable "image_tag_mutability" {
  description = "MUTABLE keeps the :latest force-new-deployment model; IMMUTABLE requires digest/sha pinning."
  type        = string
  default     = "MUTABLE"
}

variable "secrets_kms_key_arn" {
  description = "Optional KMS key ARN for the Secrets Manager secret."
  type        = string
  default     = ""
}

variable "secret_recovery_window_in_days" {
  type    = number
  default = 7
}
