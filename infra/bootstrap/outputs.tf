output "state_bucket_name" {
  description = "S3 bucket used for Terraform remote state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "dynamodb_table_name" {
  description = "DynamoDB table used for Terraform state locking."
  value       = aws_dynamodb_table.terraform_locks.name
}

output "backend_config" {
  description = "Backend config values for infra/sisub."
  value = {
    bucket         = aws_s3_bucket.terraform_state.bucket
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
    region         = var.aws_region
    key            = "sisub/${var.environment}/terraform.tfstate"
    encrypt        = true
    use_lockfile   = true
  }
}
