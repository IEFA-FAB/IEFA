import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/env"

// Keep the portal schema name centralized so renaming `iefa` -> `portal`
// only requires a database migration plus this constant update.
export const PORTAL_DB_SCHEMA = "iefa" as const
export const JOURNAL_DB_SCHEMA = "journal" as const

// Cast to the full SupabaseClient type from @supabase/supabase-js so that
// auth methods like onAuthStateChange are accessible without type errors.
// @supabase/ssr's own SupabaseAuthClient type omits subscription methods.
export const supabase = createBrowserClient(env.VITE_IEFA_SUPABASE_URL, env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY) as unknown as SupabaseClient

export const portalDb = () => supabase.schema(PORTAL_DB_SCHEMA)
export const journalDb = () => supabase.schema(JOURNAL_DB_SCHEMA)
