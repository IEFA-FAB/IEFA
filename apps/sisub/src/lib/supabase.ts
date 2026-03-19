import { createClient } from "@supabase/supabase-js"

import { ENV } from "varlock/env"

const supabaseUrl = ENV.VITE_SISUB_SUPABASE_URL
const supabaseKey = ENV.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey, {
	db: { schema: "sisub" },
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})

export default supabase
