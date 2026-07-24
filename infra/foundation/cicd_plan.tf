# ============================================================
# CI/CD — GitHub Actions OIDC Terraform PLAN role (read-only)
# ------------------------------------------------------------
# Separate from the deploy role on purpose. The deploy role can only roll a new
# ECS image and is restricted to `main`. This role runs `terraform plan` on PRs
# to surface the infra diff for review (Greptile + humans) and is:
#   - read-only (AWS managed ReadOnlyAccess + an explicit deny on secret values),
#   - assumable only from pull_request events of this repo,
#   - never able to mutate anything (no apply in CI).
# Apply-on-merge is intentionally NOT wired: infra stays human-applied.
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
data "aws_iam_policy_document" "github_tf_plan_deny" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  statement {
    sid       = "DenySecretValueReads"
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_tf_plan_deny" {
  count = var.enable_github_tf_plan_role ? 1 : 0

  name   = "${local.name_prefix}-github-tf-plan-deny"
  role   = aws_iam_role.github_tf_plan[0].id
  policy = data.aws_iam_policy_document.github_tf_plan_deny[0].json
}
