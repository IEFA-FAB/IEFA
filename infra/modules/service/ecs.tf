resource "aws_cloudwatch_log_group" "this" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  name              = "/ecs/${var.name_prefix}/${var.service_name}"
  retention_in_days = var.cloudwatch_log_retention_days
}

locals {
  container_definition = merge(
    {
      name      = var.service_name
      image     = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        },
      ]

      environment = [
        for env_name, env_value in var.environment_variables : {
          name  = env_name
          value = env_value
        }
      ]

      secrets = [
        for secret_name in var.secret_names : {
          name      = secret_name
          valueFrom = "${aws_secretsmanager_secret.this.arn}:${secret_name}::"
        }
      ]
    },
    var.enable_cloudwatch_logs ? {
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this[0].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }
    } : {},
  )
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name_prefix}-${var.service_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn
  container_definitions    = jsonencode([local.container_definition])
}

resource "aws_ecs_service" "this" {
  name            = var.service_name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  # A load-balanced service needs its target group associated with the ALB via a
  # listener rule first; when the service has no host/path rule yet (e.g. before
  # domains are configured) it runs unattached and the grace period is invalid.
  health_check_grace_period_seconds  = local.make_rule ? var.health_check_grace_period_seconds : null
  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent
  enable_execute_command             = false

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
    base              = 0
  }

  dynamic "capacity_provider_strategy" {
    for_each = (var.fargate_on_demand_weight > 0 || var.fargate_on_demand_base > 0) ? [1] : []

    content {
      capacity_provider = "FARGATE"
      weight            = var.fargate_on_demand_weight
      base              = var.fargate_on_demand_base
    }
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.tasks_security_group_id]
    assign_public_ip = var.assign_public_ip
  }

  dynamic "load_balancer" {
    for_each = local.make_rule ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.this.arn
      container_name   = var.service_name
      container_port   = var.container_port
    }
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener_rule.this]
}
