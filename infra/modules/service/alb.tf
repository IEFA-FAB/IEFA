resource "aws_lb_target_group" "this" {
  name                 = substr("${var.name_prefix}-${var.service_name}", 0, 32)
  port                 = var.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = var.deregistration_delay

  health_check {
    enabled = true
    # 2 sucessos (o mínimo do ALB) × 15 s: a task nova entra em rotação ~30 s depois de
    # responder, folgado dentro do grace period de 120 s, e o deploy não fica esperando.
    # 15 s, e não os 30 s do default, é o meio-termo entre detectar task presa rápido e
    # não encher o processo de sondas (cada serviço é sondado de cada nó do ALB).
    healthy_threshold   = 2
    unhealthy_threshold = var.health_check_unhealthy_threshold
    interval            = 15
    timeout             = var.health_check_timeout_seconds
    # Só 200. Com "200-399", um redirect (guard de auth, barra final, host canônico)
    # passava por saudável sem o servidor ter rodado a checagem do /health. Cada app
    # responde 200 direto, sem redirect, e 503 quando reprova (memória, pool preso).
    matcher  = "200"
    path     = var.health_check_path
    protocol = "HTTP"
  }
}

# ALB -> task ingress is opened once in the foundation (all TCP from the ALB SG),
# because services share the tasks SG and many share port 3000, which would
# collide as duplicate SG permissions if managed per service.

locals {
  has_host_rule = length(var.hosts) > 0
  has_path_rule = !local.has_host_rule && length(var.path_patterns) > 0
  make_rule     = local.has_host_rule || local.has_path_rule
}

resource "aws_lb_listener_rule" "this" {
  count = local.make_rule ? 1 : 0

  listener_arn = var.listener_arn
  priority     = var.listener_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  dynamic "condition" {
    for_each = local.has_host_rule ? [1] : []
    content {
      host_header {
        values = var.hosts
      }
    }
  }

  dynamic "condition" {
    for_each = local.has_path_rule ? [1] : []
    content {
      path_pattern {
        values = var.path_patterns
      }
    }
  }
}

resource "aws_route53_record" "this" {
  for_each = var.route53_zone_id == "" ? toset([]) : toset(var.hosts)

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
