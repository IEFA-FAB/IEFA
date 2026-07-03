locals {
  services = merge(
    local.service_portal,
    local.service_sisub,
    local.service_api,
    local.service_alpha,
    local.service_rumaer,
    local.service_forms,
    local.service_5s,
    local.service_docs,
  )

  service_names = sort(keys(local.services))

  default_service_hosts = var.root_domain == "" ? {} : {
    for name in local.service_names : name => ["${name}.${var.root_domain}"]
  }

  service_hosts = {
    for name in local.service_names : name => distinct(concat(
      try(local.default_service_hosts[name], []),
      lookup(var.service_domains, name, []),
    ))
  }

  public_scheme = var.certificate_arn == "" ? "http" : "https"

  service_public_urls = {
    for name, hosts in local.service_hosts : name => length(hosts) == 0 ? "" : "${local.public_scheme}://${hosts[0]}"
  }

  computed_service_environment = {
    for name in local.service_names : name => merge(
      contains(["portal", "sisub", "rumaer"], name) && local.service_public_urls[name] != "" ? {
        VITE_PUBLIC_URL = local.service_public_urls[name]
      } : {},
      name == "portal" && local.service_public_urls["api"] != "" ? {
        VITE_IEFA_API_URL = local.service_public_urls["api"]
      } : {},
      name == "portal" && local.service_public_urls["alpha"] != "" ? {
        VITE_ALPHA_API_URL = local.service_public_urls["alpha"]
      } : {},
      name == "sisub" && local.service_public_urls["api"] != "" ? {
        IEFA_API_BASE_URL = local.service_public_urls["api"]
      } : {},
      name == "sisub" && local.service_public_urls["alpha"] != "" ? {
        ALPHA_API_BASE_URL = local.service_public_urls["alpha"]
      } : {},
    )
  }

  listener_rule_services = {
    for name, hosts in local.service_hosts : name => {
      hosts    = hosts
      priority = local.services[name].listener_priority
    }
    if length(hosts) > 0 && name != var.default_service_name
  }

  route53_records = var.route53_zone_id == "" ? {} : {
    for record in flatten([
      for service_name, hosts in local.service_hosts : [
        for host in hosts : {
          key  = "${service_name}:${host}"
          host = host
        }
      ]
    ]) : record.key => record
  }
}
