locals {
  service_api = {
    api = {
      docker_target     = "api"
      container_port    = 3000
      cpu               = 256
      memory            = 512
      health_check_path = "/health"
      listener_priority = 120
      environment = {
        NODE_ENV = "production"
        API_PORT = "3000"
      }
      secret_names = [
        "API_SUPABASE_URL",
        "API_SUPABASE_SERVICE_ROLE_KEY",
        "ADMIN_SECRET",
      ]
    }
  }
}
