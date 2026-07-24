# Static-site stack for the docs app (S3 + CloudFront).
#
# Replaces the ECS service in ../docs. The docs app prerenders to plain files —
# there is nothing left to run — so it costs a CloudFront distribution instead of
# a Fargate task plus a public IPv4, and it is served from the São Paulo/Rio edge
# instead of a single origin.
#
# Bring-up order (DNS lives at Registro.br, so two steps are manual):
#
#   1. terraform apply                  → bucket + distribution on *.cloudfront.net
#      Deploy the site, verify it on the CloudFront domain.
#   2. terraform output certificate_validation_records
#      Add those CNAMEs at Registro.br, wait for ACM to report ISSUED.
#   3. Set certificate_arn = <certificate_arn_created> in terraform.tfvars,
#      terraform apply → distribution answers on docs.iefa.com.br.
#   4. Repoint the docs.iefa.com.br CNAME at Registro.br from the ALB to
#      distribution_domain_name.
#   5. cd ../docs && terraform destroy  → removes the now-idle ECS service.
#
# Doing 5 only after 4 keeps the cutover free of downtime.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = data.terraform_remote_state.foundation.outputs.tags
  }
}

# CloudFront reads its certificate from us-east-1 only. Control plane only — it
# does not pull any traffic through that region.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = data.terraform_remote_state.foundation.outputs.tags
  }
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = var.foundation_state_key
    region = var.state_region
  }
}

module "site" {
  source = "../modules/static-site"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix = data.terraform_remote_state.foundation.outputs.name_prefix
  site_name   = var.site_name

  hosts                 = var.hosts
  certificate_arn       = var.certificate_arn
  provision_certificate = var.provision_certificate
  price_class           = var.price_class
}

output "bucket_name" {
  value = module.site.bucket_name
}

output "distribution_id" {
  value = module.site.distribution_id
}

output "distribution_domain_name" {
  value = module.site.distribution_domain_name
}

output "certificate_arn_created" {
  value = module.site.certificate_arn_created
}

output "certificate_validation_records" {
  value = module.site.certificate_validation_records
}
