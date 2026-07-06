import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "#/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const SUCONT_DB_SCHEMA = "sucont" as const

// Cast para o tipo SupabaseClient completo para que os métodos de auth
// (onAuthStateChange etc.) fiquem acessíveis sem erro de tipo.
export const supabase = createBrowserClient(env.VITE_SUCONT_SUPABASE_URL, env.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY) as unknown as SupabaseClient
