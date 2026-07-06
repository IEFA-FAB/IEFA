data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ---- Execution role (shared) ----
# Pulls images and injects secrets. Secrets are granted by name prefix so a new
# service secret is covered without editing the foundation state.
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
          Resource = [
            "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.secret_name_prefix}*",
          ]
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

# ---- Task role (shared) ----
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

# ---- Bedrock invoke (shared) ----
# Concede à task role compartilhada permissão de invocar modelos Bedrock via a
# Converse API. Usado pelo adapter bedrock do @iefa/ai-provider (sisub, sucont) —
# autenticação keyless pela task role, sem API key. Escopo: foundation-models +
# inference-profiles (perfis cross-region exigem ambos) nas regiões configuradas.
data "aws_iam_policy_document" "task_bedrock" {
  count = var.enable_bedrock_task_access ? 1 : 0

  statement {
    sid = "InvokeBedrockModels"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
    ]
    resources = concat(
      [for r in var.bedrock_regions : "arn:aws:bedrock:${r}::foundation-model/*"],
      [for r in var.bedrock_regions : "arn:aws:bedrock:${r}:${data.aws_caller_identity.current.account_id}:inference-profile/*"],
    )
  }
}

resource "aws_iam_role_policy" "task_bedrock" {
  count = var.enable_bedrock_task_access ? 1 : 0

  name   = "${local.name_prefix}-ecs-task-bedrock"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_bedrock[0].json
}
