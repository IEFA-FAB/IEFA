import { createClient } from "@supabase/supabase-js"
import { env } from "../env"

const supabaseUrl = env.VITE_SISUB_SUPABASE_URL
const supabaseKey = env.VITE_SISUB_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey, {
	db: { schema: "sisub" },
	auth: {
		persistSession: true,
		storageKey: "auth_iefa",
	},
})

export default supabase
