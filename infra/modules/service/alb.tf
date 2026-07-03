resource "aws_lb_target_group" "this" {
  name                 = substr("${var.name_prefix}-${var.service_name}", 0, 32)
  port                 = var.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 15
    timeout             = 5
    matcher             = "200-399"
    path                = var.health_check_path
    protocol            = "HTTP"
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
