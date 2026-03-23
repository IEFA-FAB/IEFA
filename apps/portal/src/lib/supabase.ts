import { createClient } from "@supabase/supabase-js"
import { env } from "@/env"

// Create client without schema lock to support both 'iefa' and 'journal' schemas
// Schema will be specified per-query: .from('schema.table')
export const supabase = createClient(env.VITE_IEFA_SUPABASE_URL, env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY, {
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})
