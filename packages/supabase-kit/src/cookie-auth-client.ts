/**
 * @module cookie-auth-client
 * Client SSR de autenticação a partir de um header `Cookie` explícito.
 *
 * Existe porque as rotas Nitro (`routes/api/**`) rodam FORA do contexto de request
 * do TanStack Start: `getRequest()` — e portanto `createSsrAuthClient` — não está
 * disponível ali. O header vem do `H3Event`, e o parsing é o mesmo de
 * `startCookieMethods`.
 *
 * Somente leitura de sessão: `setAll` é no-op de propósito. Um endpoint SSE não
 * tem como reescrever cookie depois que o stream abre, e um refresh silencioso
 * emitiria `Set-Cookie` que o cliente já não vai processar.
 */
import type { Database, SchemaName } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"

import { authTimeoutFetch } from "./timeout-fetch.ts"

export type CookieAuthClientOptions<S extends SchemaName> = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/**
	 * Chave usada pelo client de auth — prefira a publishable/anon: `getUser()`
	 * valida o JWT no servidor Supabase de qualquer forma, e a service role faria
	 * qualquer query acidental por este client burlar a RLS.
	 */
	key: string
	/** Conteúdo bruto do header `Cookie` da request (ausente ⇒ sem sessão). */
	cookieHeader: string | undefined
	/** Schema default. Só afeta queries de dados feitas por engano neste client. */
	schema?: S
	/** Override do `fetch`. Default: deadline de auth (5 s). */
	fetch?: typeof fetch
}

export function createCookieAuthClient<S extends SchemaName>({ url, key, cookieHeader, schema, fetch }: CookieAuthClientOptions<S>) {
	const parsed = (cookieHeader ?? "")
		.split(";")
		.filter((c) => c.trim() !== "")
		.map((c) => {
			const [name, ...v] = c.split("=")
			return { name: name.trim(), value: v.join("=") }
		})

	return createServerClient<Database, S>(url, key, {
		...(schema ? { db: { schema } } : {}),
		global: { fetch: fetch ?? authTimeoutFetch },
		cookies: {
			getAll: () => parsed,
			setAll: () => {},
		},
	})
}
