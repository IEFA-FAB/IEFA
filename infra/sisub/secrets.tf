resource "aws_secretsmanager_secret" "service" {
  for_each = local.services

  name                    = "/${var.project}/${var.environment}/${each.key}"
  description             = "Runtime JSON env secret for ${each.key} ECS task."
  recovery_window_in_days = 7
  kms_key_id              = var.secrets_kms_key_arn == "" ? null : var.secrets_kms_key_arn
}
