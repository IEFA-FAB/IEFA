import { createAppBrowserClient } from "@iefa/supabase-kit"

import { env } from "@/lib/env"

const supabase = createAppBrowserClient({
	url: env.VITE_SISUB_SUPABASE_URL,
	publishableKey: env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
	schema: "sisub",
})

export default supabase
