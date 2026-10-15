/**
 * Clientes Supabase para o sisub-mcp server, via `@iefa/supabase-kit`.
 *
 * getDataClient()  — service role, bypass RLS, para todas as queries de dados.
 * getAuthClient()  — chave anon/publishable, para validar o JWT do usuário via auth.getUser().
 *
 * Ambos criam um client por chamada (não são singletons) para segurança em
 * ambientes com múltiplas sessões concorrentes.
 *
 * O kit é o que põe deadline no fetch (10 s dados, 5 s auth). Sem ele, um GoTrue ou
 * PostgREST que trava sem responder segura o request MCP até o ALB cortar — e o
 * `auth.getUser` roda em TODO request autenticado por JWT.
 */

import type { SchemaName } from "@iefa/database"
import { createServiceRoleClient, createStatelessAuthClient } from "@iefa/supabase-kit"

function requireEnv(key: string): string {
	const val = process.env[key]
	if (!val) throw new Error(`Variável de ambiente ausente: ${key}`)
	return val
}

/**
 * Cliente com service role key — bypassa RLS. Parametrizado por schema após o
 * split de `sisub` em schemas por domínio (ex.: "access_control" p/ mcp_api_keys
 * e user_permissions; "kitchen" p/ daily_menu/menu_template).
 * Use após a permissão PBAC ter sido verificada.
 */
export function getDataClient<S extends SchemaName>(schema: S) {
	return createServiceRoleClient({
		url: requireEnv("VITE_SISUB_SUPABASE_URL"),
		secretKey: requireEnv("SISUB_SUPABASE_SECRET_KEY"),
		schema,
	})
}

/**
 * Cliente sem sessão com a chave anon — usado APENAS para validar o JWT do usuário
 * (`auth.getUser(jwt)`). Nunca use para queries de dados (sem bypass RLS).
 *
 * A variável continua `SISUB_SUPABASE_ANON_KEY` porque é o nome do segredo da task
 * em produção; a chave anon legada é aceita onde o kit pede a publishable.
 */
export function getAuthClient() {
	return createStatelessAuthClient({
		url: requireEnv("VITE_SISUB_SUPABASE_URL"),
		publishableKey: requireEnv("SISUB_SUPABASE_ANON_KEY"),
	})
}
