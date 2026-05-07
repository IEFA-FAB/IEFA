import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/env"

export const FORMS_DB_SCHEMA = "forms" as const

export const supabase = createBrowserClient(env.VITE_IEFA_SUPABASE_URL, env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY) as unknown as SupabaseClient

export const formsDb = () => supabase.schema(FORMS_DB_SCHEMA)
