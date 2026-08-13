/**
 * @module start
 * Client SSR de autenticação para apps TanStack Start.
 *
 * Subpath separado (`@iefa/supabase-kit/start`) porque é o único ponto do kit que
 * depende de `@tanstack/react-start/server` — apps que não são Start (api, alpha,
 * sisub-mcp) consomem a raiz do pacote sem arrastar essa dependência.
 */
import type { Database, SchemaName } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { getRequest, setCookie } from "@tanstack/react-start/server"

import { authTimeoutFetch } from "./timeout-fetch.ts"

/**
 * Ponte entre os cookies da request do TanStack Start e o formato que o
 * `@supabase/ssr` espera. Extraída porque as 6 apps mantinham cópias byte a byte
 * desta função — e uma correção aqui precisava de 6 commits para chegar a todas.
 */
export function startCookieMethods() {
	return {
		getAll() {
			const request = getRequest()
			const cookieHeader = request?.headers.get("cookie")
			if (!cookieHeader) return []

			return cookieHeader.split(";").map((c) => {
				const [name, ...v] = c.split("=")
				return { name: name.trim(), value: v.join("=") }
			})
		},
		async setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]) {
			for (const { name, value, options } of cookies) {
				await setCookie(name, value, options)
			}
		},
	}
}

export type SsrAuthClientOptions<S extends SchemaName> = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/**
	 * Chave usada pelo client de auth.
	 *
	 * Prefira a publishable/anon: `getUser()` valida o JWT do cookie no servidor
	 * Supabase de qualquer forma, e inicializar com a service role faria qualquer
	 * query acidental por este client burlar a RLS.
	 */
	key: string
	/** Schema default. Só afeta queries de dados feitas por engano neste client. */
	schema?: S
	/** Override do `fetch`. Default: deadline de auth (5 s). */
	fetch?: typeof fetch
}

/**
 * Client Supabase SSR para autenticação: lê e escreve os cookies de sessão da
 * request, que é o que faz `auth.getUser()` / `auth.getSession()` funcionarem no
 * servidor. Use APENAS nas server functions de auth; para dados, use
 * `createServiceRoleClient`.
 */
export function createSsrAuthClient<S extends SchemaName>({ url, key, schema, fetch }: SsrAuthClientOptions<S>) {
	return createServerClient<Database, S>(url, key, {
		...(schema ? { db: { schema } } : {}),
		global: { fetch: fetch ?? authTimeoutFetch },
		cookies: startCookieMethods(),
	})
}
