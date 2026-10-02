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
# de nome, porque os stacks criam roles/políticas próprias.
#
# `iam:*` no prefixo, sozinho, era admin disfarçado: bastava criar uma role
# `${local.name_prefix}-x` com AdministratorAccess, ou um PutRolePolicy com `*` na
# própria tf-apply. O que fecha isso (padrão "permissions boundary delegada"):
#   - role `${local.name_prefix}-*` só nasce, ganha policy ou troca de boundary se
#     carregar a boundary `${local.name_prefix}-workload-boundary` (iam.tf), que nega
#     IAM/Organizations/Account — o teto de qualquer role criada aqui é o PowerUser
#     que a tf-apply já tem;
#   - a boundary não pode ser removida de role nenhuma nem ter a policy alterada;
#   - as três roles de CI (deploy, tf-plan, tf-apply) não carregam boundary e ficam
#     fora do alcance do CI: nenhuma escrita de policy, trust ou boundary nelas.
#
# Consequência: as roles de CI e a boundary são BOOTSTRAP. Mudar a policy ou o
# trust delas (cicd.tf, cicd_plan.tf, este arquivo, `workload_boundary` em iam.tf)
# só sai por `terraform apply` local da foundation com credencial de admin; o
# terraform-apply do CI falha com AccessDenied nesses recursos. Ver infra/README.md.
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
  # stack), para gerenciar as roles de workload. Os Deny abaixo cortam o que daria
  # escalada: role sem a boundary de workload, a própria boundary e as roles de CI.
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

  # Role do projeto só nasce ou ganha policy com a boundary de workload. Sem a
  # boundary o valor da chave é ausente e o StringNotEquals nega também.
  statement {
    sid    = "DenyRoleWritesWithoutWorkloadBoundary"
    effect = "Deny"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
      "iam:PutRolePermissionsBoundary",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*"]

    condition {
      test     = "StringNotEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.workload_boundary.arn]
    }
  }

  statement {
    sid       = "DenyBoundaryRemoval"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*"]
  }

  statement {
    sid    = "DenyBoundaryTampering"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]
    resources = [aws_iam_policy.workload_boundary.arn]
  }

  # As roles de CI não têm boundary (a tf-apply precisa do iam:* acima) e por isso
  # ficam fora do alcance do próprio CI: sem isso, a tf-apply escreveria `*` na
  # própria policy. Alterá-las é apply local com admin (ver cabeçalho).
  statement {
    sid    = "DenyCiRoleWrites"
    effect = "Deny"
    actions = [
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
      "iam:DeleteRole",
    ]
    resources = local.github_ci_role_arns
  }
}

locals {
  github_ci_role_arns = [
    for name in ["github-deploy", "github-tf-plan", "github-tf-apply"] :
    "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-${name}"
  ]
}

resource "aws_iam_role_policy" "github_tf_apply_iam" {
  count = var.enable_github_tf_apply_role ? 1 : 0

  name   = "${local.name_prefix}-github-tf-apply-iam"
  role   = aws_iam_role.github_tf_apply[0].id
  policy = data.aws_iam_policy_document.github_tf_apply_iam[0].json

  # Os Deny desta policy valem para o próprio apply que a grava. Ela vai por ÚLTIMO
  # entre os recursos de IAM da foundation, para que o apply que a introduz (ou a
  # altera) ainda consiga gravar a boundary nas roles de workload e as policies das
  # roles de CI antes de o Deny passar a valer.
  depends_on = [
    aws_iam_policy.workload_boundary,
    aws_iam_role.task_execution,
    aws_iam_role_policy_attachment.task_execution_managed,
    aws_iam_role_policy.task_execution_secrets,
    aws_iam_role.task,
    aws_iam_role_policy.task_additional,
    aws_iam_role_policy.task_deny_bedrock,
    aws_iam_role.task_ai,
    aws_iam_role_policy.task_ai_additional,
    aws_iam_role_policy.task_bedrock,
    aws_iam_role.github_deploy,
    aws_iam_role_policy.github_deploy,
    aws_iam_role.github_tf_plan,
    aws_iam_role_policy_attachment.github_tf_plan_readonly,
    aws_iam_role_policy.github_tf_plan_deny,
    aws_iam_role.github_tf_apply,
    aws_iam_role_policy_attachment.github_tf_apply_poweruser,
  ]
}
