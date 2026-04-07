import { createClient } from "@supabase/supabase-js"
import { env } from "@/env"

// Keep the portal schema name centralized so renaming `iefa` -> `portal`
// only requires a database migration plus this constant update.
export const PORTAL_DB_SCHEMA = "iefa" as const
export const JOURNAL_DB_SCHEMA = "journal" as const

export const supabase = createClient(env.VITE_IEFA_SUPABASE_URL, env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY, {
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})

export const portalDb = () => supabase.schema(PORTAL_DB_SCHEMA)
export const journalDb = () => supabase.schema(JOURNAL_DB_SCHEMA)
