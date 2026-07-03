# Per-service stack. Identical across every service — the service definition
# comes from terraform.tfvars. Reads shared platform outputs from the foundation
# stack and instantiates the reusable `service` module.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = data.terraform_remote_state.foundation.outputs.tags
  }
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = var.foundation_state_key
    region = var.state_region
  }
}

locals {
  f = data.terraform_remote_state.foundation.outputs
}

module "service" {
  source = "../modules/service"

  # Platform (foundation)
  aws_region              = local.f.aws_region
  name_prefix             = local.f.name_prefix
  project                 = local.f.project
  environment             = local.f.environment
  tags                    = local.f.tags
  vpc_id                  = local.f.vpc_id
  subnet_ids              = local.f.public_subnet_ids
  listener_arn            = local.f.listener_arn
  alb_security_group_id   = local.f.alb_security_group_id
  tasks_security_group_id = local.f.tasks_security_group_id
  cluster_id              = local.f.ecs_cluster_id
  execution_role_arn      = local.f.task_execution_role_arn
  task_role_arn           = local.f.task_role_arn
  alb_dns_name            = local.f.alb_dns_name
  alb_zone_id             = local.f.alb_zone_id
  route53_zone_id         = local.f.route53_zone_id
  secrets_kms_key_arn     = local.f.secrets_kms_key_arn

  # Service definition (from terraform.tfvars)
  service_name          = var.service_name
  docker_target         = var.docker_target
  container_port        = var.container_port
  cpu                   = var.cpu
  memory                = var.memory
  health_check_path     = var.health_check_path
  listener_priority     = var.listener_priority
  environment_variables = var.environment_variables
  secret_names          = var.secret_names
  hosts                 = var.hosts
  path_patterns         = var.path_patterns

  # Rollout knobs
  image_tag                = var.image_tag
  desired_count            = var.desired_count
  fargate_on_demand_base   = var.fargate_on_demand_base
  fargate_on_demand_weight = var.fargate_on_demand_weight
  assign_public_ip         = var.assign_public_ip
  enable_cloudwatch_logs   = var.enable_cloudwatch_logs

  cloudwatch_log_retention_days = var.cloudwatch_log_retention_days
  image_tag_mutability          = var.image_tag_mutability
}

output "ecr_repository_url" {
  value = module.service.ecr_repository_url
}

output "secret_name" {
  value = module.service.secret_name
}

output "service_name" {
  value = module.service.service_name
}
