output "alb_dns_name" {
  description = "Public DNS name for the shared ALB."
  value       = aws_lb.this.dns_name
}

output "aws_region" {
  description = "AWS region used by this stack."
  value       = var.aws_region
}

output "alb_zone_id" {
  description = "Route53 hosted zone id for the ALB."
  value       = aws_lb.this.zone_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_services" {
  description = "ECS service names by service key."
  value = {
    for name, service in aws_ecs_service.service : name => service.name
  }
}

output "ecr_repositories" {
  description = "ECR repository URLs by service."
  value = {
    for name, repo in aws_ecr_repository.service : name => repo.repository_url
  }
}

output "ecr_registry" {
  description = "ECR registry hostname used by docker buildx bake."
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repository_prefix" {
  description = "ECR repository prefix used by docker buildx bake."
  value       = "${var.project}/${var.environment}"
}

output "docker_build_targets" {
  description = "Dockerfile target to build for each service."
  value = {
    for name, service in local.services : name => service.docker_target
  }
}

output "secret_names" {
  description = "Secrets Manager secret names by service. Store JSON payloads with the expected env keys."
  value = {
    for name, secret in aws_secretsmanager_secret.service : name => secret.name
  }
}

output "service_hosts" {
  description = "Configured hostnames by service."
  value       = local.service_hosts
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
