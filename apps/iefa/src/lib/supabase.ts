import { createClient } from "@supabase/supabase-js"
import { env } from "@/env"

if (!env.VITE_IEFA_SUPABASE_URL || !env.VITE_IEFA_SUPABASE_ANON_KEY) {
	throw new Error("Missing Supabase environment variables")
}

// Create client without schema lock to support both 'iefa' and 'journal' schemas
// Schema will be specified per-query: .from('schema.table')
export const supabase = createClient(env.VITE_IEFA_SUPABASE_URL, env.VITE_IEFA_SUPABASE_ANON_KEY, {
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})
