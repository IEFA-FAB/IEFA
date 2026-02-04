variable "REGISTRY" {
  default = "registry.fly.io"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["api", "iefa", "sisub", "docs"]
}

group "apps" {
  targets = ["iefa", "sisub"]
}

target "base" {
  dockerfile = "Dockerfile"
  context = "."
  cache-from = ["type=gha"]
  cache-to = ["type=gha,mode=max"]
}

target "api" {
  inherits = ["base"]
  target = "api"
  tags = ["${REGISTRY}/iefa-api:${TAG}"]
}

target "iefa" {
  inherits = ["base"]
  target = "iefa"
  tags = ["${REGISTRY}/iefa:${TAG}"]
  args = {
    VITE_IEFA_SUPABASE_URL = ""
    VITE_IEFA_SUPABASE_ANON_KEY = ""
  }
}

target "sisub" {
  inherits = ["base"]
  target = "sisub"
  tags = ["${REGISTRY}/sisub:${TAG}"]
  args = {
    VITE_SISUB_SUPABASE_URL = ""
    VITE_SISUB_SUPABASE_ANON_KEY = ""
  }
}

target "docs" {
  inherits = ["base"]
  target = "docs"
  tags = ["${REGISTRY}/iefa-docs:${TAG}"]
}
