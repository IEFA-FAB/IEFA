import type { Database, SchemaName } from "@iefa/database"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { SERVER_AUTH_OPTIONS } from "./server-options.ts"
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
 * Opções que valem para todo client de servidor do kit:
 * - `autoRefreshToken: false`: fora do navegador o GoTrueClient do auth-js arma, ao terminar o
 *   `initialize()`, um `setInterval` de 30 s de auto-refresh que nada desarma. O intervalo
 *   referencia o client, então cada request deixava um timer e um client vivos até o fim do
 *   processo. Não há sessão para renovar aqui: a service role não faz login.
 * - `db.retry: false`: o postgrest-js repete GET/HEAD em erro de rede (e o abort do deadline conta
 *   como erro de rede, porque o motivo é um `Error` comum) até 3 vezes, com espera de 1 + 2 + 4 s.
 *   O deadline do `fetch` é por tentativa, então uma leitura chegava a ~47 s. Sem o retry o
 *   deadline vale para a operação inteira. Ver `timeout-fetch.ts`.
 *
 * `createClient` é chamado sem generics (a sobrecarga nova do supabase-js não aceita
 * um schema genérico `S` em `db.schema`) e o retorno é tipado via cast para
 * `SupabaseClient<Database, S>` — runtime idêntico, tipo preciso no call site.
 */
export function createServiceRoleClient<S extends SchemaName>({ url, secretKey, schema, fetch }: ServiceRoleClientOptions<S>): SupabaseClient<Database, S> {
	return createClient(url, secretKey, {
		db: { schema, retry: false },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: fetch ?? dataTimeoutFetch },
	}) as unknown as SupabaseClient<Database, S>
}
