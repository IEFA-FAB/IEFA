locals {
  service_rumaer = {
    rumaer = {
      docker_target     = "rumaer"
      container_port    = 3000
      cpu               = 256
      memory            = 512
      health_check_path = "/health"
      listener_priority = 140
      environment = {
        NODE_ENV = "production"
        PORT     = "3000"
      }
      secret_names = [
        "VITE_RUMAER_SUPABASE_URL",
        "VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY",
        "RUMAER_SUPABASE_SECRET_KEY",
      ]
    }
  }
}
