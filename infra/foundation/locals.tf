data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  public_scheme = var.certificate_arn == "" ? "http" : "https"

  # Prefix shared by every per-service Secrets Manager secret
  # (/<project>/<environment>/<service>). Used for the execution role wildcard.
  secret_name_prefix = "/${var.project}/${var.environment}/"

  tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "foundation"
    },
    var.tags,
  )
}
