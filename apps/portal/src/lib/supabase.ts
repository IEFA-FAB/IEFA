import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "@/env"

// Keep the portal schema name centralized so renaming `iefa` -> `portal`
// only requires a database migration plus this constant update.
export const PORTAL_DB_SCHEMA = "iefa" as const
export const JOURNAL_DB_SCHEMA = "journal" as const

export const supabase = createAppBrowserClient({
	url: env.VITE_IEFA_SUPABASE_URL,
	publishableKey: env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
})

export const portalDb = () => supabase.schema(PORTAL_DB_SCHEMA)
export const journalDb = () => supabase.schema(JOURNAL_DB_SCHEMA)
