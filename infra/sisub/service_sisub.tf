locals {
  service_sisub = {
    sisub = {
      docker_target     = "sisub"
      container_port    = 3000
      cpu               = 512
      memory            = 1024
      health_check_path = "/health"
      listener_priority = 110
      environment = {
        NODE_ENV = "production"
        PORT     = "3000"
      }
      secret_names = [
        "VITE_SISUB_SUPABASE_URL",
        "VITE_SISUB_SUPABASE_PUBLISHABLE_KEY",
        "SISUB_SUPABASE_SECRET_KEY",
        "SISUB_DATABASE_URL",
        "ADMIN_SECRET",
      ]
    }
  }
}
