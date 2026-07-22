variable "name_prefix" {
  type = string
}

variable "site_name" {
  description = "Site key = bucket suffix and CloudFront comment. One word, lowercase."
  type        = string
}

variable "hosts" {
  description = "Hostnames served by the distribution. Empty means CloudFront answers only on its own *.cloudfront.net domain, which is what you want before the certificate is issued."
  type        = list(string)
  default     = []
}

variable "certificate_arn" {
  description = "ARN of an ISSUED us-east-1 certificate covering every entry in `hosts`. Empty keeps the distribution on the default CloudFront certificate and ignores `hosts` — see acm.tf for the two-phase bring-up."
  type        = string
  default     = ""
}

variable "provision_certificate" {
  description = "Create a us-east-1 certificate for `hosts`. Validation records must be added by hand at the DNS provider; see acm.tf."
  type        = bool
  default     = false
}

variable "price_class" {
  description = "CloudFront price class. Keep PriceClass_All: the cheaper classes exclude South America, so Brazilian visitors would be served from a North American edge instead of São Paulo/Rio — measurably slower than the ALB this replaces."
  type        = string
  default     = "PriceClass_All"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.price_class)
    error_message = "price_class must be one of PriceClass_All, PriceClass_200, PriceClass_100."
  }
}

variable "default_root_object" {
  type    = string
  default = "index.html"
}

variable "passthrough_prefixes" {
  description = "URI prefixes the directory-index rewrite must leave alone. Prerendered API artifacts (the site index, the search index) are extensionless files, so the default '/foo' → '/foo/index.html' rewrite would break them."
  type        = list(string)
  default     = ["/api/"]
}
