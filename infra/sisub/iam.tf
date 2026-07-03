data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "${local.name_prefix}-ecs-execution-secrets"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "ReadServiceSecrets"
          Effect = "Allow"
          Action = [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ]
          Resource = [for secret in aws_secretsmanager_secret.service : secret.arn]
        },
      ],
      var.secrets_kms_key_arn == "" ? [] : [
        {
          Sid      = "DecryptSecrets"
          Effect   = "Allow"
          Action   = ["kms:Decrypt"]
          Resource = var.secrets_kms_key_arn
        },
      ],
    )
  })
}

resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

resource "aws_iam_role_policy" "task_additional" {
  count = var.task_role_policy_json == "" ? 0 : 1

  name   = "${local.name_prefix}-ecs-task-extra"
  role   = aws_iam_role.task.id
  policy = var.task_role_policy_json
}
