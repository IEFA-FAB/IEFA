# ALB access logs → S3. Sem eles não há visibilidade por-request (status por path,
# target_processing_time, elb_status_code 502/504) — o que transformou o debug do
# 502 do /global/ingredients em adivinhação. Também não havia log driver nos tasks.
#
# sa-east-1 é uma região anterior a ago/2022 → a entrega de logs do ELB usa a CONTA
# regional do ELB (não o service principal `logdelivery.elasticloadbalancing`).
# São Paulo (sa-east-1) = 507241528517.
# Ref: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html
locals {
  # Conta do ELB por região para entrega de access logs (regiões pré-ago/2022).
  elb_log_delivery_account_ids = {
    "sa-east-1" = "507241528517"
    "us-east-1" = "127311923021"
    "us-east-2" = "033677994240"
    "us-west-2" = "797873946194"
  }
  elb_log_delivery_account_id = local.elb_log_delivery_account_ids[var.aws_region]
}

resource "aws_s3_bucket" "alb_logs" {
  bucket = "${local.name_prefix}-alb-logs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ALB access logs exigem SSE-S3 (AES256). SSE-KMS com CMK não é suportado.
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Expira os logs após 30 dias — controle de custo (mesmo princípio da otimização de
# custo recente). Ajuste a retenção conforme a necessidade de auditoria.
resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-access-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "alb_logs" {
  # A conta regional do ELB grava os objetos de log.
  statement {
    sid       = "AllowELBAccountPutObject"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.elb_log_delivery_account_id}:root"]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json
}
