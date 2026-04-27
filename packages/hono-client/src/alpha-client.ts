import type { AppType as AlphaAppType } from "@iefa/alpha"
import { hc } from "hono/client"

export type { AlphaAppType }

export type AlphaClientOptions = {
	baseUrl: string
	/** Bearer token do Supabase Auth */
	token?: string
	headers?: Record<string, string>
}

/**
 * Cria um cliente RPC tipado para o @iefa/alpha (porta 3001).
 *
 * Rotas requerem Bearer token (Supabase JWT).
 * Use `getAlphaClient(token)` para criar um cliente autenticado por request.
 *
 * @example
 * ```ts
 * const client = createAlphaClient({ baseUrl: 'https://iefa-ai.fly.dev', token })
 * const res = await client.api.v1.sessions.$post()
 * const { session_id } = await res.json()
 * ```
 */
export function createAlphaClient({ baseUrl, token, headers = {} }: AlphaClientOptions) {
	return hc<AlphaAppType>(baseUrl, {
		headers: {
			...headers,
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	})
}

export type AlphaClient = ReturnType<typeof createAlphaClient>
