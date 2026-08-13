import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "#/env"

// Schema dedicado da app no projeto Supabase compartilhado.
export const SUCONT_DB_SCHEMA = "sucont" as const

export const supabase = createAppBrowserClient({
	url: env.VITE_SUCONT_SUPABASE_URL,
	publishableKey: env.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY,
})
