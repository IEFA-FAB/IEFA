resource "aws_secretsmanager_secret" "this" {
  name                    = "/${var.project}/${var.environment}/${var.service_name}"
  description             = "Runtime JSON env secret for the ${var.service_name} ECS task."
  recovery_window_in_days = var.secret_recovery_window_in_days
  kms_key_id              = var.secrets_kms_key_arn == "" ? null : var.secrets_kms_key_arn
}
