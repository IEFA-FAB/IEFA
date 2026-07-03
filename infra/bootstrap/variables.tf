variable "project" {
  description = "Project prefix used for backend resources."
  type        = string
  default     = "iefa"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for the Terraform backend resources."
  type        = string
  default     = "sa-east-1"
}

variable "state_bucket_name" {
  description = "Optional globally unique S3 bucket name. Defaults to project-environment-terraform-state-account-id."
  type        = string
  default     = null
}

variable "dynamodb_table_name" {
  description = "Optional DynamoDB table name for Terraform state locking."
  type        = string
  default     = null
}

variable "force_destroy_state_bucket" {
  description = "Allow destroying the state bucket even when it contains objects. Keep false for production."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags applied to backend resources."
  type        = map(string)
  default     = {}
}
