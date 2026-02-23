import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
	throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: { persistSession: false },
})
