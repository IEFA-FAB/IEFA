import { createBrowserClient } from "@supabase/ssr"

import { env } from "@/lib/env"

const supabase = createBrowserClient(env.VITE_SISUB_SUPABASE_URL, env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY, {
	db: { schema: "sisub" },
	cookieOptions: {
		name: "auth_iefa",
	},
})

export default supabase
