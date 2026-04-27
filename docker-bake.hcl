variable "REGISTRY" {
  default = "registry.fly.io"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["api", "portal", "sisub", "docs", "alpha"]
}

group "apps" {
  targets = ["portal", "sisub"]
}

target "base" {
  dockerfile = "Dockerfile"
  context = "."
}

target "api" {
  inherits = ["base"]
  target = "api"
  tags = ["${REGISTRY}/iefa-api:${TAG}"]
  cache-from = ["type=gha,scope=api"]
  cache-to = ["type=gha,scope=api,mode=max"]
}

target "portal" {
  inherits = ["base"]
  target = "portal"
  tags = ["${REGISTRY}/portal:${TAG}"]
  cache-from = ["type=gha,scope=portal"]
  cache-to = ["type=gha,scope=portal,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL = ""
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = ""
  }
}

target "sisub" {
  inherits = ["base"]
  target = "sisub"
  tags = ["${REGISTRY}/sisub:${TAG}"]
  cache-from = ["type=gha,scope=sisub"]
  cache-to = ["type=gha,scope=sisub,mode=max"]
  args = {
    VITE_SISUB_SUPABASE_URL = ""
    VITE_SISUB_SUPABASE_PUBLISHABLE_KEY = ""
  }
}

target "docs" {
  inherits = ["base"]
  target   = "docs"
  tags     = ["${REGISTRY}/iefa-docs:${TAG}"]
  cache-from = ["type=gha,scope=docs"]
  cache-to = ["type=gha,scope=docs,mode=max"]
}

target "alpha" {
  inherits = ["base"]
  target   = "alpha"
  tags     = ["${REGISTRY}/iefa-ai:${TAG}"]
  cache-from = ["type=gha,scope=alpha"]
  cache-to = ["type=gha,scope=alpha,mode=max"]
}
