# CloudFront certificate — must live in us-east-1 regardless of where the rest of
# the platform runs. This is a control-plane constraint only: TLS is still
# terminated at the edge nearest the visitor, so it costs nothing in latency.
#
# Two-phase, same as the ALB certificate in foundation/acm.tf, because DNS for
# iefa.com.br is managed at Registro.br rather than Route53:
#
#   1. provision_certificate = true → creates the cert (PENDING_VALIDATION) and
#      exposes `certificate_validation_records`. Add those CNAMEs at Registro.br.
#      The distribution stays on the default *.cloudfront.net certificate.
#   2. Once ACM reports ISSUED, set certificate_arn to certificate_arn_created and
#      re-apply → the distribution starts answering on the custom hostnames.
#
# No aws_acm_certificate_validation resource: it would block apply waiting on
# records that only exist after somebody adds them by hand.

resource "aws_acm_certificate" "this" {
  provider = aws.us_east_1
  count    = var.provision_certificate ? 1 : 0

  domain_name               = var.hosts[0]
  subject_alternative_names = slice(var.hosts, 1, length(var.hosts))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
