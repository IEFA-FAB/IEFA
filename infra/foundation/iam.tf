data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ---- Permissions boundary das roles de workload ----
# Teto de toda role `${local.name_prefix}-*` que não é de CI. A role tf-apply tem
# `iam:*` nesse prefixo (cicd_apply.tf) e só consegue criar ou alterar role se ela
# carregar ESTA boundary: anexar AdministratorAccess a uma role nova vira, na
# prática, "tudo menos IAM/Organizations/Account" — o mesmo PowerUser que a própria
# tf-apply já tem, sem escada para admin.
#
# Allow amplo de propósito: a boundary não concede nada sozinha (vale a interseção
# com a policy de identidade), ela só corta o que nenhum workload precisa. Nenhuma
# task do ECS chama IAM: a execution role usa ECR/Logs/Secrets/KMS e a task role usa
# Bedrock.
#
# Alterar esta policy pelo CI é negado (cicd_apply.tf, DenyBoundaryTampering): uma
# mudança aqui só sai por apply local com credencial de admin.
data "aws_iam_policy_document" "workload_boundary" {
  statement {
    sid         = "AllowWorkloadServices"
    effect      = "Allow"
    not_actions = ["iam:*", "organizations:*", "account:*"]
    resources   = ["*"]
  }

  # Redundante com o NotAction acima, mas explícito: um Deny não some se alguém
  # trocar o Allow por `*` numa edição futura.
  statement {
    sid       = "DenyIdentityAndAccountWrites"
    effect    = "Deny"
    actions   = ["iam:*", "organizations:*", "account:*"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name        = "${local.name_prefix}-workload-boundary"
  description = "Permissions boundary de toda role de workload ${local.name_prefix}-*: nega IAM, Organizations e Account."
  policy      = data.aws_iam_policy_document.workload_boundary.json
}

# ---- Execution role (shared) ----
# Pulls images and injects secrets. Secrets are granted by name prefix so a new
# service secret is covered without editing the foundation state.
resource "aws_iam_role" "task_execution" {
  name                 = "${local.name_prefix}-ecs-execution"
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_assume_role.json
  permissions_boundary = aws_iam_policy.workload_boundary.arn
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
# Role de todo serviço que não usa IA. Bedrock é negado aqui explicitamente (ver
# task_deny_bedrock): os serviços de IA usam a role `-ecs-task-ai` abaixo.
resource "aws_iam_role" "task" {
  name                 = "${local.name_prefix}-ecs-task"
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_assume_role.json
  permissions_boundary = aws_iam_policy.workload_boundary.arn
}

# `task_role_policy_json` vem do TF_TFVARS_JSON (fora do repo). Em produção ele é a
# policy de Bedrock (InvokeModel* em global.anthropic.* / anthropic.* /
# openai.gpt-oss-*, ver AI-PROVIDERS.md). Continua anexada às DUAS roles para não
# tirar de nenhum serviço permissão que não seja Bedrock; na role compartilhada, a
# parte de Bedrock fica anulada pelo Deny abaixo.
resource "aws_iam_role_policy" "task_additional" {
  count = var.task_role_policy_json == "" ? 0 : 1

  name   = "${local.name_prefix}-ecs-task-extra"
  role   = aws_iam_role.task.id
  policy = var.task_role_policy_json
}

# Serviço sem IA não invoca modelo. Deny explícito porque a policy extra acima vem de
# fora do repo e pode conceder Bedrock: o Deny vale qualquer que seja o conteúdo dela.
resource "aws_iam_role_policy" "task_deny_bedrock" {
  count = var.restrict_bedrock_to_ai_task_role ? 1 : 0

  name = "${local.name_prefix}-ecs-task-deny-bedrock"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DenyBedrockOutsideAiServices"
        Effect   = "Deny"
        Action   = ["bedrock:*"]
        Resource = "*"
      },
    ]
  })
}

# ---- Task role dos serviços de IA ----
# Só os serviços em `bedrock_task_services` (alpha, portal, sisub, sucont: os que
# importam @iefa/ai-provider ou chamam o Bedrock direto) rodam com esta role; o stack
# de cada serviço escolhe a role pelo output `task_role_arns_by_service`.
resource "aws_iam_role" "task_ai" {
  name                 = "${local.name_prefix}-ecs-task-ai"
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_assume_role.json
  permissions_boundary = aws_iam_policy.workload_boundary.arn
}

# Mesma policy extra da role compartilhada: é dela que vem o Bedrock aplicado hoje
# em produção (o `task_bedrock` abaixo está desligado no tfvars real).
resource "aws_iam_role_policy" "task_ai_additional" {
  count = var.task_role_policy_json == "" ? 0 : 1

  name   = "${local.name_prefix}-ecs-task-ai-extra"
  role   = aws_iam_role.task_ai.id
  policy = var.task_role_policy_json
}

# ---- Bedrock invoke (serviços de IA) ----
# Concede à task role de IA permissão de invocar modelos Bedrock via a Converse API.
# Usado pelo adapter bedrock do @iefa/ai-provider — autenticação keyless pela task
# role, sem API key. Escopo: foundation-models + inference-profiles (perfis
# cross-region exigem ambos) nas regiões configuradas.
data "aws_iam_policy_document" "task_bedrock" {
  count = var.enable_bedrock_task_access ? 1 : 0

  statement {
    sid = "InvokeBedrockModels"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
      # Rerank (bedrock-agent-runtime) — usado pelo retriever do alpha para
      # reordenar os trechos de norma recuperados. Ação distinta de InvokeModel.
      "bedrock:Rerank",
    ]
    resources = concat(
      [for r in var.bedrock_regions : "arn:aws:bedrock:${r}::foundation-model/*"],
      [for r in var.bedrock_regions : "arn:aws:bedrock:${r}:${data.aws_caller_identity.current.account_id}:inference-profile/*"],
    )
  }
}

resource "aws_iam_role_policy" "task_bedrock" {
  count = var.enable_bedrock_task_access ? 1 : 0

  name   = "${local.name_prefix}-ecs-task-ai-bedrock"
  role   = aws_iam_role.task_ai.id
  policy = data.aws_iam_policy_document.task_bedrock[0].json
}
