locals {
  bucket_name = "${var.name_prefix}-${var.site_name}-site"
}

# Private bucket. Nothing reaches it except CloudFront, via the origin access
# control below — there is no website endpoint and no public read.
resource "aws_s3_bucket" "this" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only this distribution may read, and only through OAC — the SourceArn condition
# is what stops another account's distribution from pointing at this bucket.
data "aws_iam_policy_document" "bucket" {
  statement {
    sid     = "AllowCloudFrontRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.this.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.bucket.json
}
