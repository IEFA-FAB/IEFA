# Número de tasks do serviço (Application Auto Scaling).
#
# Todo serviço tem um scalable target: é ele, e não o `desired_count` do aws_ecs_service
# (ignorado depois da criação, ver ecs.tf), que diz quantas tasks rodam. Sem autoscaling
# (`autoscaling_max_count` até o `desired_count`), mínimo = máximo = `desired_count` e o
# serviço fica fixo; mudar o `desired_count` move os dois limites e o ECS ajusta as tasks sem
# redeploy.
#
# Com `autoscaling_max_count` acima do `desired_count`, uma política de target tracking mantém
# a média de CPU do serviço perto de `autoscaling_cpu_target`: passou do alvo por ~3 min,
# sobe tasks (até o máximo); ficou abaixo por ~15 min, desce (até o `desired_count`). Sobe
# rápido e desce devagar de propósito: task nova em Spot leva ~1–2 min para ficar saudável.
#
# Só CPU, de propósito: o RSS do Bun não volta depois de um pico, então uma política de
# memória subiria tasks e não deixaria descer (mais tasks não diminuem a memória das que já
# estão de pé). Memória é protegida pelo health check, que tira a task da rotação perto do
# limite.

resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.this.name}"
  min_capacity       = var.desired_count
  max_capacity       = max(var.desired_count, var.autoscaling_max_count)
}

resource "aws_appautoscaling_policy" "cpu" {
  count = var.autoscaling_max_count > var.desired_count ? 1 : 0

  name               = "${var.service_name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.autoscaling_cpu_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 300

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
