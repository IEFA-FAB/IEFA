locals {
  service_portal = {
    portal = {
      docker_target     = "portal"
      container_port    = 3000
      cpu               = 256
      memory            = 512
      health_check_path = "/health"
      listener_priority = 100
      environment = {
        NODE_ENV = "production"
        PORT     = "3000"
      }
      secret_names = [
        "VITE_IEFA_SUPABASE_URL",
        "VITE_IEFA_SUPABASE_PUBLISHABLE_KEY",
        "IEFA_SUPABASE_SECRET_KEY",
      ]
    }
  }
}
