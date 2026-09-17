import { createAppBrowserClient } from "@iefa/supabase-kit"
import { env } from "@/env"

export const supabase = createAppBrowserClient({
	url: env.VITE_IEFA_SUPABASE_URL,
	publishableKey: env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
})
