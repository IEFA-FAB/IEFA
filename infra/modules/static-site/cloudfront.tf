resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-${var.site_name}"
  description                       = "OAC for the ${var.site_name} static site bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 REST origins only resolve an index document at the root, so "/docs/alpha/"
# would 404 against a prerendered "/docs/alpha/index.html". This rewrites the URI
# at the edge, which is the supported way to keep the bucket private (an S3
# website endpoint resolves indexes on its own, but requires a public bucket).
resource "aws_cloudfront_function" "index_rewrite" {
  name    = "${var.name_prefix}-${var.site_name}-index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Maps directory URIs to their prerendered index.html."
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var passthrough = ${jsonencode(var.passthrough_prefixes)};

      // Prerendered API artifacts (site index, search index) are extensionless
      // files. Appending /index.html to them would 404 the whole site's
      // navigation and search.
      for (var i = 0; i < passthrough.length; i++) {
        if (uri.indexOf(passthrough[i]) === 0) return request;
      }

      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
        return request;
      }

      var last = uri.substring(uri.lastIndexOf('/') + 1);
      if (last.indexOf('.') === -1) request.uri = uri + '/index.html';

      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix} ${var.site_name} static site"
  default_root_object = var.default_root_object
  price_class         = var.price_class

  # Custom hostnames only once a certificate covering them is issued; until then
  # the distribution answers on its own *.cloudfront.net name.
  aliases = var.certificate_arn == "" ? [] : var.hosts

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    # Brotli/gzip at the edge. The build deliberately does not pre-compress:
    # S3 cannot negotiate encodings, so precompressed variants would be dead
    # weight (see compressPublicAssets in the app's vite.config.ts).
    compress = true

    # Managed-CachingOptimized: honours the Cache-Control the deploy sets on each
    # object, so HTML revalidates while fingerprinted assets stay immutable.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index_rewrite.arn
    }
  }

  # Every real page is prerendered, so a miss is a genuinely wrong URL. Serving
  # the app shell lets the router render its own not-found page, and the 404
  # status is preserved rather than masked as a 200.
  dynamic "custom_error_response" {
    for_each = toset([403, 404])

    content {
      error_code            = custom_error_response.key
      response_code         = 404
      response_page_path    = "/${var.default_root_object}"
      error_caching_min_ttl = 60
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.certificate_arn == ""
    acm_certificate_arn            = var.certificate_arn == "" ? null : var.certificate_arn
    ssl_support_method             = var.certificate_arn == "" ? null : "sni-only"
    minimum_protocol_version       = var.certificate_arn == "" ? null : "TLSv1.2_2021"
  }
}
