// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js"
import { env } from "../env.ts"

// auth.persistSession false em ambiente server
const supabase = createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
	db: { schema: "sisub" },
	auth: { persistSession: false },
})

export default supabase
