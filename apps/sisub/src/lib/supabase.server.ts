import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

/**
 * Supabase client for server-side use only.
 * Uses the secret key — never import this in client-side code.
 */
export const supabaseServer = createClient<Database>(
	process.env.VITE_SISUB_SUPABASE_URL!,
	process.env.SISUB_SUPABASE_SECRET_KEY!,
	{
		db: { schema: "sisub" },
		auth: { persistSession: false },
	}
)
