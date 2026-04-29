import { createClient } from "@supabase/supabase-js"
import { envServer } from "./env.server"

/**
 * Cliente Supabase com service role para operações de dados no servidor.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 *
 * Usa o schema "journal" por padrão.
 */
export function getJournalServerClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "journal" },
		auth: { persistSession: false },
	})
}
