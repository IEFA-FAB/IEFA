locals {
  service_alpha = {
    alpha = {
      docker_target     = "alpha"
      container_port    = 8000
      cpu               = 512
      memory            = 1024
      health_check_path = "/health"
      listener_priority = 130
      environment = {
        NODE_ENV = "production"
        PORT     = "8000"
      }
      secret_names = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "DATABASE_URL",
        "NVIDIA_API_KEY",
      ]
    }
  }
}
