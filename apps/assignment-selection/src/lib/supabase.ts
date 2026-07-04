import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const ASSIGNMENT_SELECTION_DB_SCHEMA = "assignment_selection" as const

// Cast para o tipo SupabaseClient completo para que métodos de realtime
// (channel/removeChannel) fiquem acessíveis sem erro de tipo.
export const supabase = createBrowserClient(
	env.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
	env.VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY
) as unknown as SupabaseClient

export const assignmentDb = () => supabase.schema(ASSIGNMENT_SELECTION_DB_SCHEMA)
