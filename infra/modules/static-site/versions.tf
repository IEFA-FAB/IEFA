terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
      # CloudFront only accepts certificates from us-east-1, no matter where the
      # bucket and the rest of the platform live. The caller passes both.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
