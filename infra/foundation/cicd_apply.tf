# ============================================================
# CI/CD — GitHub Actions OIDC Terraform APPLY role (main only)
# ------------------------------------------------------------
# Third and last CI role, deliberately separate from the other two:
#   - `<prefix>-github-deploy`  → só rola imagem no ECS (main).
#   - `<prefix>-github-tf-plan` → read-only, só em pull_request.
#   - `<prefix>-github-tf-apply` (aqui) → aplica os stacks, só em `main`.
#
# Existe porque `deploy.yml` nunca aplicou Terraform: a infra ficava dependendo de
# um apply manual e, na prática, não acontecia — as mudanças de cpu, log driver e
# ALB access logs do PR #104 ficaram semanas sem sair do papel enquanto o sisub
# devolvia 502. Um workflow que aplica no merge fecha essa lacuna
# (`.github/workflows/terraform-apply.yml`).
#
# Escopo: PowerUserAccess (tudo menos IAM/Organizations) + IAM restrito por prefixo
# de nome, porque os stacks criam roles/políticas próprias. Não é admin: não
# consegue mexer em role/política fora de `${local.name_prefix}-*`.
# ============================================================

variable "enable_github_tf_apply_role" {
  description = "Create the GitHub Actions OIDC role used by the terraform-apply workflow on main."
  type        = bool
  default     = true
}

variable "github_apply_subject_refs" {
  description = "OIDC `sub` refs allowed to assume the apply role, appended to repo:<owner>/<name>:. Defaults to the main branch only."
  type        = list(string)
  default     = ["ref:refs/heads/main"]
}

data "aws_iam_policy_document" "github_tf_apply_assume" {
  count = var.enable_github_tf_apply_role ? 1 : 0

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
      values   = [for ref in var.github_apply_subject_refs : "repo:${var.github_repository}:${ref}"]
    }
  }
}

resource "aws_iam_role" "github_tf_apply" {
  count = var.enable_github_tf_apply_role ? 1 : 0

  name               = "${local.name_prefix}-github-tf-apply"
  assume_role_policy = data.aws_iam_policy_document.github_tf_apply_assume[0].json
}

# Tudo menos IAM, Organizations e Account. Cobre ECS, ELB, EC2/VPC, ECR, S3, KMS,
# Logs, Route53, ACM, Secrets Manager e DynamoDB (lock do state).
resource "aws_iam_role_policy_attachment" "github_tf_apply_poweruser" {
  count = var.enable_github_tf_apply_role ? 1 : 0

  role       = aws_iam_role.github_tf_apply[0].id
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "github_tf_apply_iam" {
  count = var.enable_github_tf_apply_role ? 1 : 0

  # IAM de escrita SÓ nos recursos do projeto (roles e políticas com o prefixo do
  # stack). É o que a foundation precisa para gerenciar as task roles e as três
  # roles de CI — inclusive esta, senão o próximo apply não conseguiria alterá-la.
  statement {
    sid     = "ManageProjectIamRoles"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*",
      "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*",
    ]
  }

  # Provider OIDC do GitHub: recurso de conta, sem prefixo de nome possível.
  statement {
    sid = "ManageGithubOidcProvider"
    actions = [
      "iam:GetOpenIDConnectProvider",
      "iam:CreateOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:AddClientIDToOpenIDConnectProvider",
    ]
    resources = ["arn:aws:iam::${local.account_id}:oidc-provider/${local.github_oidc_url}"]
  }

  # Entregar as task roles ao ECS ao registrar uma task definition.
  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  # Nenhum stack lê valor de secret — o módulo só cria o container
  # (`aws_secretsmanager_secret`), e os valores entram pelo put-secret.sh /
  # sync-secrets. Negar explicitamente mantém a regra verdadeira sob PowerUser.
  statement {
    sid       = "DenySecretValueReads"
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_tf_apply_iam" {
  count = var.enable_github_tf_apply_role ? 1 : 0

  name   = "${local.name_prefix}-github-tf-apply-iam"
  role   = aws_iam_role.github_tf_apply[0].id
  policy = data.aws_iam_policy_document.github_tf_apply_iam[0].json
}
