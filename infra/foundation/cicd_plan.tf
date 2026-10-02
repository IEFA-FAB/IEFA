# ============================================================
# CI/CD — GitHub Actions OIDC Terraform PLAN role (read-only)
# ------------------------------------------------------------
# Separate from the deploy role on purpose. The deploy role can only roll a new
# ECS image and is restricted to `main`. This role runs `terraform plan` on PRs
# to surface the infra diff for review (Greptile + humans) and is:
#   - read-only (AWS managed ReadOnlyAccess + explicit denies on secret values and
#     on data reads: logs, objects, items, image layers — see github_tf_plan_deny),
#   - assumable only from pull_request events of this repo,
#   - never able to mutate anything (no apply from a PR).
# O apply no merge é feito por uma role separada, `<prefix>-github-tf-apply`
# (ver cicd_apply.tf), assumível só a partir de `main`.
# ============================================================

variable "enable_github_tf_plan_role" {
  description = "Create the read-only GitHub Actions OIDC role used by the terraform-plan PR workflow."
  type        = bool
  default     = true
}

variable "github_plan_subject_refs" {
  description = "OIDC `sub` refs allowed to assume the plan role, appended to repo:<owner>/<name>:. Defaults to pull_request events."
  type        = list(string)
  default     = ["pull_request"]
}

data "aws_iam_policy_document" "github_tf_plan_assume" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${local.github_oidc_url}:sub"
      values   = [for ref in var.github_plan_subject_refs : "repo:${var.github_repository}:${ref}"]
    }
  }
}

resource "aws_iam_role" "github_tf_plan" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  name               = "${local.name_prefix}-github-tf-plan"
  assume_role_policy = data.aws_iam_policy_document.github_tf_plan_assume[0].json
}

# Broad read for `plan` to refresh state across every resource type the stacks
# touch (ECS, ELB, EC2/VPC, S3, IAM, ECR, Logs, Route53, ACM, secret metadata).
resource "aws_iam_role_policy_attachment" "github_tf_plan_readonly" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  role       = aws_iam_role.github_tf_plan[0].id
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Defense in depth: plan only reads secret *metadata* (aws_secretsmanager_secret),
# never values. Explicitly deny value reads and KMS decrypt so a read-only PR job
# can never exfiltrate runtime secrets even if ReadOnlyAccess would allow it.
#
# O mesmo vale para DADO: ReadOnlyAccess lê log de aplicação, objeto de qualquer
# bucket, item de DynamoDB, camada de imagem e parâmetro do SSM — e esta role é
# assumível por qualquer PR do repo público. O `plan` só precisa de METADADO
# (Describe*/Get*Policy/List*), mais o state no S3 e o digest do state na tabela de
# lock. Esses dois ficam de fora dos Deny (NotResource).
locals {
  tf_state_bucket_name = coalesce(var.tf_state_bucket_name, "${local.name_prefix}-terraform-state-${local.account_id}")
  tf_lock_table_name   = coalesce(var.tf_lock_table_name, "${local.name_prefix}-terraform-locks")
}

data "aws_iam_policy_document" "github_tf_plan_deny" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  statement {
    sid    = "DenySecretValueReads"
    effect = "Deny"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:BatchGetSecretValue",
      "kms:Decrypt",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:GetParameterHistory",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "DenyLogDataReads"
    effect = "Deny"
    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:GetLogRecord",
      "logs:StartLiveTail",
    ]
    resources = ["*"]
  }

  statement {
    sid           = "DenyObjectReadsOutsideState"
    effect        = "Deny"
    actions       = ["s3:GetObject", "s3:GetObjectVersion"]
    not_resources = ["arn:aws:s3:::${local.tf_state_bucket_name}/*"]
  }

  statement {
    sid    = "DenyItemReadsOutsideLockTable"
    effect = "Deny"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:PartiQLSelect",
      "dynamodb:GetRecords",
    ]
    not_resources = ["arn:aws:dynamodb:*:${local.account_id}:table/${local.tf_lock_table_name}"]
  }

  statement {
    sid       = "DenyImageLayerReads"
    effect    = "Deny"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = ["*"]
  }

  # Outras leituras de dado que o ReadOnlyAccess concede e que nenhum stack usa:
  # trilha de API, resultado de query (Athena sobre os access logs do ALB, por
  # exemplo), saída de comando e console de instância, código de função.
  statement {
    sid    = "DenyOtherDataReads"
    effect = "Deny"
    actions = [
      "cloudtrail:LookupEvents",
      "athena:GetQueryResults",
      "athena:GetQueryResultsStream",
      "ssm:GetCommandInvocation",
      "logs:GetLogGroupFields",
      "ec2:GetConsoleOutput",
      "ec2:GetConsoleScreenshot",
      "lambda:GetFunction",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_tf_plan_deny" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  name   = "${local.name_prefix}-github-tf-plan-deny"
  role   = aws_iam_role.github_tf_plan[0].id
  policy = data.aws_iam_policy_document.github_tf_plan_deny[0].json
}
