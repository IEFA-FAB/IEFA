import type { Database, SchemaName } from "@iefa/database"
import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

export type BrowserClientOptions<S extends SchemaName> = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/** Chave publishable/anon (`VITE_<APP>_SUPABASE_PUBLISHABLE_KEY`). */
	publishableKey: string
	/** Schema default do client. Omitido = `public`; use `.schema(x)` no call site. */
	schema?: S
}

/**
 * Client Supabase do browser, com sessão persistida em cookie pelo `@supabase/ssr`.
 *
 * O retorno é castado para o `SupabaseClient` completo de `@supabase/supabase-js`:
 * o tipo próprio do `@supabase/ssr` omite os métodos de subscription (`onAuthStateChange`)
 * e de realtime (`channel`/`removeChannel`), que os apps usam.
 */
export function createAppBrowserClient<S extends SchemaName>({ url, publishableKey, schema }: BrowserClientOptions<S>): SupabaseClient<Database, S> {
	// `Secure` quando a página é HTTPS: o default do @supabase/ssr não marca, e o cookie
	// carrega o refresh token. Em dev (http://localhost) fica sem, senão o navegador o recusa.
	const cookieOptions = { secure: (globalThis as { location?: { protocol?: string } }).location?.protocol === "https:" }
	return createBrowserClient(url, publishableKey, { ...(schema ? { db: { schema } } : {}), cookieOptions }) as unknown as SupabaseClient<Database, S>
}
