import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import type { Database } from "@/types/database.types"

// Cast to the full SupabaseClient type from @supabase/supabase-js so that
// auth methods like onAuthStateChange are accessible without type errors.
// @supabase/ssr's own SupabaseAuthClient type omits subscription methods.
const supabase = createBrowserClient<Database, "sisub">(env.VITE_SISUB_SUPABASE_URL, env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY, {
	db: { schema: "sisub" },
}) as unknown as SupabaseClient<Database, "sisub">

export default supabase
