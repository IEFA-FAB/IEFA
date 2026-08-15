import type { Database, SchemaName } from "@iefa/database"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { dataTimeoutFetch } from "./timeout-fetch.ts"

export type ServiceRoleClientOptions<S extends SchemaName> = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/** Chave service role (`<APP>_SUPABASE_SECRET_KEY`). Bypassa RLS. */
	secretKey: string
	/** Schema alvo. Define o narrowing de `.from()` no call site. */
	schema: S
	/** Override do `fetch`. Default: deadline de dados (10 s). */
	fetch?: typeof fetch
}

/**
 * Client Supabase service-role para operações de dados no servidor.
 *
 * `createClient` (não SSR) — não lê cookies, sempre service role → bypass de RLS.
 * A autorização é aplicada na camada de app (@iefa/pbac / operations de domínio),
 * nunca por RLS. Use só em server functions (*.fn.ts); nunca em código client-side.
 *
 * `createClient` é chamado sem generics (a sobrecarga nova do supabase-js não aceita
 * um schema genérico `S` em `db.schema`) e o retorno é tipado via cast para
 * `SupabaseClient<Database, S>` — runtime idêntico, tipo preciso no call site.
 */
export function createServiceRoleClient<S extends SchemaName>({ url, secretKey, schema, fetch }: ServiceRoleClientOptions<S>): SupabaseClient<Database, S> {
	return createClient(url, secretKey, {
		db: { schema },
		auth: { persistSession: false },
		global: { fetch: fetch ?? dataTimeoutFetch },
	}) as unknown as SupabaseClient<Database, S>
}
