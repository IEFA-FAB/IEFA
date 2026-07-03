# ============================================================
# CI/CD — GitHub Actions OIDC deploy role
# ------------------------------------------------------------
# Lets the GitHub Actions workflow assume a short-lived AWS role via OIDC
# (no long-lived access keys). Permissions are scoped by ARN convention — ECR
# repos under <project>/<environment>/* and ECS services on the shared cluster —
# so adding a new service never requires editing this role or wiring per-service
# state into it. Restricted to this repository and, by default, the `main` ref.
# ============================================================

locals {
  github_oidc_url = "token.actions.githubusercontent.com"

  # Create the account-level OIDC provider only when an existing one is not
  # supplied. AWS allows a single provider per URL per account, so reuse the
  # existing ARN if the account already trusts GitHub.
  create_github_oidc_provider = var.enable_github_deploy_role && var.github_oidc_provider_arn == ""

  github_oidc_provider_arn = var.enable_github_deploy_role ? (
    local.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.github_oidc_provider_arn
  ) : ""

  account_id = data.aws_caller_identity.current.account_id
}

resource "aws_iam_openid_connect_provider" "github" {
  count = local.create_github_oidc_provider ? 1 : 0

  url            = "https://${local.github_oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
  # GitHub's OIDC thumbprints. AWS no longer validates these for
  # token.actions.githubusercontent.com, but the argument is still required.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fca",
  ]
}

data "aws_iam_policy_document" "github_deploy_assume" {
  count = var.enable_github_deploy_role ? 1 : 0

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
      values   = [for ref in var.github_deploy_subject_refs : "repo:${var.github_repository}:${ref}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name               = "${local.name_prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume[0].json
}

data "aws_iam_policy_document" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  # ECR auth token is only grantable on "*".
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Push/pull layers on the service repositories (by name prefix).
  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [
      "arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/${var.project}/${var.environment}/*",
    ]
  }

  # Force a new deployment on any service of the shared cluster (mutable :latest
  # model). No RegisterTaskDefinition / PassRole needed because the task
  # definition already pins the tag and update-service just re-pulls it.
  statement {
    sid = "EcsDeploy"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
    ]
    resources = [
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:service/${aws_ecs_cluster.this.name}/*",
    ]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.this.arn]
    }
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name   = "${local.name_prefix}-github-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
