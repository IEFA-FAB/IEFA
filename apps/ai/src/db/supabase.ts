import { createClient } from "@supabase/supabase-js"
import { ENV } from "varlock/env"

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
})
