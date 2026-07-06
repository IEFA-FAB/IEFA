variable "REGISTRY" {
  default = "replace-me.dkr.ecr.sa-east-1.amazonaws.com"
}

variable "REPOSITORY_PREFIX" {
  default = "iefa/prod"
}

variable "TAG" {
  default = "latest"
}

variable "VITE_IEFA_SUPABASE_URL" {
  default = ""
}

variable "VITE_IEFA_SUPABASE_PUBLISHABLE_KEY" {
  default = ""
}

variable "VITE_RUMAER_SUPABASE_URL" {
  default = ""
}

variable "VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY" {
  default = ""
}

variable "VITE_ASSIGNMENT_SELECTION_SUPABASE_URL" {
  default = ""
}

variable "VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY" {
  default = ""
}

variable "VITE_SUCONT_SUPABASE_URL" {
  default = ""
}

variable "VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY" {
  default = ""
}

variable "VITE_SISUB_SUPABASE_URL" {
  default = ""
}

variable "VITE_SISUB_SUPABASE_PUBLISHABLE_KEY" {
  default = ""
}

variable "VITE_FARO_COLLECTOR_URL" {
  default = ""
}

variable "VITE_FARO_APP_NAME" {
  default = ""
}

variable "VITE_FARO_ENVIRONMENT" {
  default = ""
}

variable "FARO_SOURCEMAP_API_KEY" {
  default = ""
}

group "default" {
  targets = ["api", "portal", "rumaer", "sucont", "assignment-selection", "sisub", "forms", "docs", "alpha", "5s", "sisub-mcp"]
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
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/api:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=api"]
  cache-to = ["type=gha,scope=api,mode=max"]
}

target "portal" {
  inherits = ["base"]
  target = "portal"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/portal:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=portal"]
  cache-to = ["type=gha,scope=portal,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL             = VITE_IEFA_SUPABASE_URL
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
  }
}

target "rumaer" {
  inherits = ["base"]
  target = "rumaer"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/rumaer:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=rumaer"]
  cache-to = ["type=gha,scope=rumaer,mode=max"]
  args = {
    VITE_RUMAER_SUPABASE_URL             = VITE_RUMAER_SUPABASE_URL
    VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY = VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY
  }
}

target "sucont" {
  inherits = ["base"]
  target = "sucont"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/sucont:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=sucont"]
  cache-to = ["type=gha,scope=sucont,mode=max"]
  args = {
    VITE_SUCONT_SUPABASE_URL             = VITE_SUCONT_SUPABASE_URL
    VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY = VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY
  }
}

target "assignment-selection" {
  inherits = ["base"]
  target = "assignment-selection"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/assignment-selection:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=assignment-selection"]
  cache-to = ["type=gha,scope=assignment-selection,mode=max"]
  args = {
    VITE_ASSIGNMENT_SELECTION_SUPABASE_URL             = VITE_ASSIGNMENT_SELECTION_SUPABASE_URL
    VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY = VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY
  }
}

target "sisub" {
  inherits = ["base"]
  target = "sisub"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/sisub:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=sisub"]
  cache-to = ["type=gha,scope=sisub,mode=max"]
  args = {
    VITE_SISUB_SUPABASE_URL             = VITE_SISUB_SUPABASE_URL
    VITE_SISUB_SUPABASE_PUBLISHABLE_KEY = VITE_SISUB_SUPABASE_PUBLISHABLE_KEY
    VITE_FARO_COLLECTOR_URL             = VITE_FARO_COLLECTOR_URL
    VITE_FARO_APP_NAME                  = VITE_FARO_APP_NAME
    VITE_FARO_ENVIRONMENT               = VITE_FARO_ENVIRONMENT
    FARO_SOURCEMAP_API_KEY              = FARO_SOURCEMAP_API_KEY
  }
}

target "forms" {
  inherits = ["base"]
  target = "forms"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/forms:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=forms"]
  cache-to = ["type=gha,scope=forms,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL             = VITE_IEFA_SUPABASE_URL
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
    VITE_APP_TENANT                    = "forms"
  }
}

target "docs" {
  inherits = ["base"]
  target   = "docs"
  tags     = ["${REGISTRY}/${REPOSITORY_PREFIX}/docs:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=docs"]
  cache-to = ["type=gha,scope=docs,mode=max"]
}

target "alpha" {
  inherits = ["base"]
  target   = "alpha"
  tags     = ["${REGISTRY}/${REPOSITORY_PREFIX}/alpha:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=alpha"]
  cache-to = ["type=gha,scope=alpha,mode=max"]
}

target "5s" {
  inherits = ["base"]
  target = "forms"
  tags = ["${REGISTRY}/${REPOSITORY_PREFIX}/5s:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=5s"]
  cache-to = ["type=gha,scope=5s,mode=max"]
  args = {
    VITE_IEFA_SUPABASE_URL             = VITE_IEFA_SUPABASE_URL
    VITE_IEFA_SUPABASE_PUBLISHABLE_KEY = VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
    VITE_APP_TENANT                    = "cinco-s"
  }
}

# MCP server (server-side only; no VITE_* build args).
target "sisub-mcp" {
  inherits   = ["base"]
  target     = "sisub-mcp"
  tags       = ["${REGISTRY}/${REPOSITORY_PREFIX}/sisub-mcp:${TAG}"]
  cache-from = ["type=gha,scope=deps", "type=gha,scope=sisub-mcp"]
  cache-to   = ["type=gha,scope=sisub-mcp,mode=max"]
}
