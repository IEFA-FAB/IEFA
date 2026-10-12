# Escala horizontal automática (Application Auto Scaling, target tracking).
#
# Ligado quando `autoscaling_max_count` > 0. O ECS mantém a média de CPU e a de memória do
# serviço perto dos alvos: passou do alvo por ~3 min, sobe tasks (até o máximo); ficou abaixo
# por ~15 min, desce (até o mínimo). Sobe rápido e desce devagar de propósito: task nova em
# Spot leva ~1–2 min para ficar saudável, e descer cedo demais oscilaria.
#
# O mínimo é o `desired_count`. Um `terraform apply` neste stack volta o serviço para o
# mínimo, e o autoscaling o sobe de novo em poucos minutos se a carga continuar; para
# segurar mais tasks durante um evento, suba o `desired_count` (vira o novo mínimo) em vez de
# mexer no serviço à mão.

locals {
  # `cluster_id` é o ARN do cluster (`arn:aws:ecs:<região>:<conta>:cluster/<nome>`); o
  # Application Auto Scaling identifica o serviço pelo nome.
  cluster_name = element(split("/", var.cluster_id), 1)
}

resource "aws_appautoscaling_target" "this" {
  count = var.autoscaling_max_count > 0 ? 1 : 0

  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${local.cluster_name}/${aws_ecs_service.this.name}"
  min_capacity       = var.desired_count
  max_capacity       = var.autoscaling_max_count

  lifecycle {
    precondition {
      condition     = var.autoscaling_max_count >= var.desired_count
      error_message = "autoscaling_max_count precisa ser >= desired_count (o mínimo do autoscaling)."
    }
  }
}

resource "aws_appautoscaling_policy" "cpu" {
  count = var.autoscaling_max_count > 0 ? 1 : 0

  name               = "${var.service_name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[0].service_namespace
  scalable_dimension = aws_appautoscaling_target.this[0].scalable_dimension
  resource_id        = aws_appautoscaling_target.this[0].resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.autoscaling_cpu_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 300

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "memory" {
  count = var.autoscaling_max_count > 0 ? 1 : 0

  name               = "${var.service_name}-memory"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[0].service_namespace
  scalable_dimension = aws_appautoscaling_target.this[0].scalable_dimension
  resource_id        = aws_appautoscaling_target.this[0].resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.autoscaling_memory_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 300

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
