variable "REGISTRY" {
  default = "registry.fly.io"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["api", "iefa", "sisub", "docs", "rag"]
}

group "apps" {
  targets = ["iefa", "sisub"]
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

target "iefa" {
  inherits = ["base"]
  target = "iefa"
  tags = ["${REGISTRY}/iefa:${TAG}"]
  cache-from = ["type=gha,scope=iefa"]
  cache-to = ["type=gha,scope=iefa,mode=max"]
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

target "rag" {
  inherits = ["base"]
  target   = "rag"
  tags     = ["${REGISTRY}/iefa-rag:${TAG}"]
  cache-from = ["type=gha,scope=rag"]
  cache-to = ["type=gha,scope=rag,mode=max"]
}
