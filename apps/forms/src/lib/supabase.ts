import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "@/env"

export const FORMS_DB_SCHEMA = "forms" as const

export const supabase = createAppBrowserClient({
	url: env.VITE_IEFA_SUPABASE_URL,
	publishableKey: env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
})

export const formsDb = () => supabase.schema(FORMS_DB_SCHEMA)
