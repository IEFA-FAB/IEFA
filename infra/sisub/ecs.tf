resource "aws_ecs_cluster" "this" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name = aws_ecs_cluster.this.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
    base              = 0
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = var.enable_cloudwatch_logs ? local.services : {}

  name              = "/ecs/${local.name_prefix}/${each.key}"
  retention_in_days = var.cloudwatch_log_retention_days
}

locals {
  container_definitions = {
    for name, service in local.services : name => [
      merge(
        {
          name      = name
          image     = "${aws_ecr_repository.service[name].repository_url}:${lookup(var.image_tags, name, var.default_image_tag)}"
          essential = true

          portMappings = [
            {
              containerPort = service.container_port
              hostPort      = service.container_port
              protocol      = "tcp"
            },
          ]

          environment = [
            for env_name, env_value in merge(
              service.environment,
              local.computed_service_environment[name],
              lookup(var.service_environment_overrides, name, {}),
              ) : {
              name  = env_name
              value = env_value
            }
          ]

          secrets = [
            for secret_name in distinct(concat(
              service.secret_names,
              lookup(var.service_extra_secret_names, name, []),
              )) : {
              name      = secret_name
              valueFrom = "${aws_secretsmanager_secret.service[name].arn}:${secret_name}::"
            }
          ]
        },
        var.enable_cloudwatch_logs ? {
          logConfiguration = {
            logDriver = "awslogs"
            options = {
              awslogs-group         = aws_cloudwatch_log_group.service[name].name
              awslogs-region        = var.aws_region
              awslogs-stream-prefix = name
            }
          }
        } : {},
      )
    ]
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "${local.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(each.value.cpu)
  memory                   = tostring(each.value.memory)
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions    = jsonencode(local.container_definitions[each.key])
}

resource "aws_ecs_service" "service" {
  for_each = local.services

  name                               = each.key
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = var.desired_count
  health_check_grace_period_seconds  = 120
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
  }

  dynamic "capacity_provider_strategy" {
    for_each = var.fargate_on_demand_weight > 0 ? [1] : []

    content {
      capacity_provider = "FARGATE"
      weight            = var.fargate_on_demand_weight
    }
  }

  network_configuration {
    subnets          = [for subnet in aws_subnet.public : subnet.id]
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service[each.key].arn
    container_name   = each.key
    container_port   = each.value.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [
    aws_ecs_cluster_capacity_providers.this,
    aws_lb_listener.http,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https,
  ]
}
