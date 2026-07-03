resource "aws_lb" "this" {
  name               = substr("${local.name_prefix}-alb", 0, 32)
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for subnet in aws_subnet.public : subnet.id]

  enable_deletion_protection = false
  idle_timeout               = 60
}

resource "aws_lb_target_group" "service" {
  for_each = local.services

  name                 = substr("${local.name_prefix}-${each.key}", 0, 32)
  port                 = each.value.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 15
    timeout             = 5
    matcher             = "200-399"
    path                = each.value.health_check_path
    protocol            = "HTTP"
  }
}

resource "aws_lb_listener" "http" {
  count = var.certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[var.default_service_name].arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[var.default_service_name].arn
  }
}

locals {
  application_listener_arn = var.certificate_arn == "" ? aws_lb_listener.http[0].arn : aws_lb_listener.https[0].arn
}

resource "aws_lb_listener_rule" "host" {
  for_each = local.listener_rule_services

  listener_arn = local.application_listener_arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }

  condition {
    host_header {
      values = each.value.hosts
    }
  }
}

resource "aws_route53_record" "service" {
  for_each = local.route53_records

  zone_id = var.route53_zone_id
  name    = each.value.host
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
