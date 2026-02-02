import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_IEFA_SUPABASE_URL
const anon = import.meta.env.VITE_IEFA_SUPABASE_ANON_KEY

// Create client without schema lock to support both 'iefa' and 'journal' schemas
// Schema will be specified per-query: .from('schema.table')
export const supabase = createClient(url, anon, {
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})
