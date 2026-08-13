import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "@/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const ASSIGNMENT_SELECTION_DB_SCHEMA = "assignment_selection" as const

export const supabase = createAppBrowserClient({
	url: env.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
	publishableKey: env.VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY,
})

export const assignmentDb = () => supabase.schema(ASSIGNMENT_SELECTION_DB_SCHEMA)
