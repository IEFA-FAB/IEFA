output "service_name" {
  value = aws_ecs_service.this.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.this.repository_url
}

output "secret_name" {
  description = "Secrets Manager secret name. Store a JSON payload with the expected env keys."
  value       = aws_secretsmanager_secret.this.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.this.arn
}

output "target_group_arn" {
  value = aws_lb_target_group.this.arn
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "docker_target" {
  value = var.docker_target
}
