locals {
  service_docs = {
    docs = {
      docker_target     = "docs"
      container_port    = 3003
      cpu               = 256
      memory            = 512
      health_check_path = "/api/health"
      listener_priority = 170
      environment = {
        NODE_ENV = "production"
        PORT     = "3003"
      }
      secret_names = []
    }
  }
}
