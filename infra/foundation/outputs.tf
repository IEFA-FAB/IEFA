# Consumed by each per-service stack via terraform_remote_state.

output "aws_region" {
  description = "AWS region used by the platform."
  value       = var.aws_region
}

output "account_id" {
  description = "AWS account id."
  value       = data.aws_caller_identity.current.account_id
}

output "project" {
  value = var.project
}

output "environment" {
  value = var.environment
}

output "name_prefix" {
  value = local.name_prefix
}

output "tags" {
  description = "Base tags to merge into service resources."
  value       = local.tags
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = [for subnet in aws_subnet.public : subnet.id]
}

output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name for the shared ALB."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Route53 hosted zone id for the ALB."
  value       = aws_lb.this.zone_id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "tasks_security_group_id" {
  value = aws_security_group.tasks.id
}

output "listener_arn" {
  description = "ARN of the application listener (HTTPS when a certificate is set, otherwise HTTP)."
  value       = local.application_listener_arn
}

output "public_scheme" {
  description = "http or https, depending on whether a certificate is configured."
  value       = local.public_scheme
}

output "certificate_arn" {
  value = var.certificate_arn
}

output "route53_zone_id" {
  value = var.route53_zone_id
}

output "ecs_cluster_id" {
  value = aws_ecs_cluster.this.id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "task_execution_role_arn" {
  value = aws_iam_role.task_execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}

output "secrets_kms_key_arn" {
  value = var.secrets_kms_key_arn
}

output "ecr_registry" {
  description = "ECR registry hostname used by docker buildx bake."
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repository_prefix" {
  description = "ECR repository prefix used by docker buildx bake."
  value       = "${var.project}/${var.environment}"
}

output "github_deploy_role_arn" {
  description = "ARN of the GitHub Actions OIDC deploy role. Set as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable."
  value       = var.enable_github_deploy_role ? aws_iam_role.github_deploy[0].arn : ""
}

output "github_actions_variables" {
  description = "Values to configure as GitHub Actions repository variables for the deploy workflow."
  value = {
    AWS_REGION            = var.aws_region
    AWS_DEPLOY_ROLE_ARN   = var.enable_github_deploy_role ? aws_iam_role.github_deploy[0].arn : ""
    ECR_REGISTRY          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    ECR_REPOSITORY_PREFIX = "${var.project}/${var.environment}"
    ECS_CLUSTER           = aws_ecs_cluster.this.name
  }
}
