// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.API_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.API_SUPABASE_SERVICE_ROLE_KEY

if ((!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) && process.env.NODE_ENV !== "test") {
	throw new Error("Missing Supabase environment variables")
}

const url = SUPABASE_URL || "https://placeholder.supabase.co"
const key = SUPABASE_SERVICE_ROLE_KEY || "placeholder"

// auth.persistSession false em ambiente server
const supabase = createClient(url, key, {
	db: { schema: "sisub" },
	auth: { persistSession: false },
})

export default supabase
