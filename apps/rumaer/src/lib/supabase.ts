import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const RUMAER_DB_SCHEMA = "rumaer" as const

// Cast para o tipo SupabaseClient completo de @supabase/supabase-js para que
// métodos de auth (onAuthStateChange) fiquem acessíveis sem erro de tipo.
export const supabase = createBrowserClient(env.VITE_RUMAER_SUPABASE_URL, env.VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY) as unknown as SupabaseClient

export const rumaerDb = () => supabase.schema(RUMAER_DB_SCHEMA)
