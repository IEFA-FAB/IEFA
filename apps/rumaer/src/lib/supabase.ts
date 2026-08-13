import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "@/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const RUMAER_DB_SCHEMA = "rumaer" as const

export const supabase = createAppBrowserClient({
	url: env.VITE_RUMAER_SUPABASE_URL,
	publishableKey: env.VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY,
})

export const rumaerDb = () => supabase.schema(RUMAER_DB_SCHEMA)
