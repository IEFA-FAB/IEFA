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
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function requireEnv(key: string): string {
	const val = process.env[key]
	if (!val) throw new Error(`Variável de ambiente ausente: ${key}`)
	return val
}

type DbSchema = Exclude<keyof Database, "__InternalSupabase">

/**
 * Cliente com service role key — bypassa RLS. Parametrizado por schema após o
 * split de `sisub` em schemas por domínio (ex.: "access_control" p/ mcp_api_keys
 * e user_permissions; "kitchen" p/ daily_menu/menu_template).
 * Use após a permissão PBAC ter sido verificada.
 */
export function getDataClient<S extends DbSchema>(schema: S): SupabaseClient<Database, S> {
	return createClient(requireEnv("VITE_SISUB_SUPABASE_URL"), requireEnv("SISUB_SUPABASE_SECRET_KEY"), {
		db: { schema },
		auth: { persistSession: false },
	}) as unknown as SupabaseClient<Database, S>
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
