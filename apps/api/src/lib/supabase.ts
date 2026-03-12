// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js"
import { ENV } from "varlock/env"

// auth.persistSession false em ambiente server
const supabase = createClient(ENV.API_SUPABASE_URL, ENV.API_SUPABASE_SERVICE_ROLE_KEY, {
	db: { schema: "sisub" },
	auth: { persistSession: false },
})

export default supabase
