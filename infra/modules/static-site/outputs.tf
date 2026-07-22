output "bucket_name" {
  description = "Deploy target: aws s3 sync ./.output/public s3://<bucket>"
  value       = aws_s3_bucket.this.id
}

output "distribution_id" {
  description = "Invalidate after each deploy: aws cloudfront create-invalidation --distribution-id <id> --paths '/*'"
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "Point the site hostname here with a CNAME at the DNS provider."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "certificate_arn_created" {
  description = "ARN of the certificate this stack created. Feed it back into certificate_arn once ACM reports ISSUED."
  value       = var.provision_certificate ? aws_acm_certificate.this[0].arn : ""
}

output "certificate_validation_records" {
  description = "CNAMEs to add at the DNS provider (Registro.br) to validate the certificate."
  value = var.provision_certificate ? [
    for option in aws_acm_certificate.this[0].domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ] : []
}
