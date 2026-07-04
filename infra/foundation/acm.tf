# ACM certificate for the shared ALB (DNS-validated).
#
# Two-phase, because DNS is managed at Registro.br (not Route53):
#   1. provision_certificate = true  → creates the cert (status PENDING_VALIDATION)
#      and exposes `certificate_validation_records`. Add those CNAMEs at
#      Registro.br. The HTTPS listener stays off (certificate_arn still "").
#   2. Once ACM shows the cert ISSUED, set certificate_arn to
#      certificate_arn_created and re-apply → the ALB switches to HTTPS + 80→443
#      redirect.
#
# No aws_acm_certificate_validation resource: it would block apply waiting for
# records that only exist after you add them by hand.

resource "aws_acm_certificate" "this" {
  count = var.provision_certificate ? 1 : 0

  domain_name               = var.acm_certificate_primary_domain
  subject_alternative_names = var.acm_certificate_sans
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
