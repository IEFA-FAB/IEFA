/**
 * Clientes Supabase para o sisub-mcp server.
 *
 * getDataClient()  — service role, bypass RLS, para todas as queries de dados.
 * getAuthClient()  — anon key, para validar o JWT do usuário via auth.getUser().
 *
 * Ambos criam um client por chamada (não são singletons) para segurança em
 * ambientes com múltiplas sessões concorrentes.
 */

import type { Database } from "@iefa/database"
import { createClient } from "@supabase/supabase-js"

function requireEnv(key: string): string {
	const val = process.env[key]
	if (!val) throw new Error(`Variável de ambiente ausente: ${key}`)
	return val
}

/**
 * Cliente com service role key — bypassa RLS.
 * Use em todas as queries de dados após a permissão PBAC ter sido verificada.
 */
export function getDataClient() {
	return createClient<Database, "sisub">(requireEnv("VITE_SISUB_SUPABASE_URL"), requireEnv("SISUB_SUPABASE_SECRET_KEY"), {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente com anon key — usado APENAS para validar o JWT do usuário.
 * Nunca use para queries de dados (sem bypass RLS).
 */
export function getAuthClient() {
	return createClient<Database, "sisub">(requireEnv("VITE_SISUB_SUPABASE_URL"), requireEnv("SISUB_SUPABASE_ANON_KEY"), {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}
