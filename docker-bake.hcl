variable "REGISTRY" {
  default = "registry.fly.io"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["api", "portal", "rumaer", "sisub", "forms", "docs", "alpha", "5s"]
}

group "apps" {
  targets = ["portal", "sisub"]
}

target "base" {
  dockerfile = "Dockerfile"
  context = "."
}

# Estágio `deps` compartilhado: instala dependências do monorepo uma vez.
# Buildado isoladamente (job warm-deps) para popular o scope `deps` do cache gha.
# Todos os targets de app leem desse scope → o `bun install` não é refeito por app
# em cache frio.
target "deps" {
  inherits = ["base"]
  target = "deps"
  cache-from = ["type=gha,scope=deps"]
  cache-to = ["type=gha,scope=deps,mode=max"]
}

target "api" {
  inherits = ["base"]
  target = "api"
  tags = ["${REGISTRY}/iefa-api:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=api"]
  cache-to = ["type=gha,scope=api,mode=max"]
}

target "portal" {
  inherits = ["base"]
  target = "portal"
  tags = ["${REGISTRY}/portal:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=portal"]
  cache-to = ["type=gha,scope=portal,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL = ""
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = ""
  }
}

target "rumaer" {
  inherits = ["base"]
  target = "rumaer"
  tags = ["${REGISTRY}/iefa-rumaer:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=rumaer"]
  cache-to = ["type=gha,scope=rumaer,mode=max"]
  args = {
    VITE_RUMAER_SUPABASE_URL = ""
    VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY = ""
  }
}

target "sisub" {
  inherits = ["base"]
  target = "sisub"
  tags = ["${REGISTRY}/sisub:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=sisub"]
  cache-to = ["type=gha,scope=sisub,mode=max"]
  args = {
    VITE_SISUB_SUPABASE_URL = ""
    VITE_SISUB_SUPABASE_PUBLISHABLE_KEY = ""
    VITE_FARO_COLLECTOR_URL = ""
    VITE_FARO_APP_NAME = ""
    VITE_FARO_ENVIRONMENT = ""
    FARO_SOURCEMAP_API_KEY = ""
  }
}

target "forms" {
  inherits = ["base"]
  target = "forms"
  tags = ["${REGISTRY}/iefa-forms:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=forms"]
  cache-to = ["type=gha,scope=forms,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL = ""
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = ""
    VITE_APP_TENANT = "forms"
  }
}

target "docs" {
  inherits = ["base"]
  target   = "docs"
  tags     = ["${REGISTRY}/iefa-docs:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=docs"]
  cache-to = ["type=gha,scope=docs,mode=max"]
}

target "alpha" {
  inherits = ["base"]
  target   = "alpha"
  tags     = ["${REGISTRY}/iefa-ai:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=alpha"]
  cache-to = ["type=gha,scope=alpha,mode=max"]
}

target "5s" {
  inherits = ["base"]
  target = "forms"
  tags = ["${REGISTRY}/iefa-5s:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=5s"]
  cache-to = ["type=gha,scope=5s,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL = ""
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = ""
    VITE_APP_TENANT = "cinco-s"
  }
}
