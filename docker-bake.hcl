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
  secret = ["id=env,src=.env.iefa"]
}

target "sisub" {
  inherits = ["base"]
  target = "sisub"
  tags = ["${REGISTRY}/iefa-sisub:${TAG}"]
  secret = ["id=env,src=.env.sisub"]
}

target "docs" {
  inherits = ["base"]
  target = "docs"
  tags = ["${REGISTRY}/iefa-docs:${TAG}"]
}
