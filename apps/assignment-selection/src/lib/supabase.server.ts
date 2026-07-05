import type { Database } from "@iefa/database"
import { createClient } from "@supabase/supabase-js"
import { envServer } from "@/env.server"

/**
 * Cliente Supabase com service role para o schema `assignment_selection`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getAssignmentServerClient() {
	return createClient<Database, "assignment_selection">(envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL, envServer.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY, {
		db: { schema: "assignment_selection" },
		auth: { persistSession: false },
	})
}
