import type { AppType as AiAppType } from "@iefa/ai"
import { hc } from "hono/client"

export type { AiAppType }

export type AiClientOptions = {
	baseUrl: string
	/** Bearer token do Supabase Auth */
	token?: string
	headers?: Record<string, string>
}

/**
 * Cria um cliente RPC tipado para o @iefa/ai (porta 3001).
 *
 * Rotas requerem Bearer token (Supabase JWT).
 * Use `getAiClient(token)` para criar um cliente autenticado por request.
 *
 * @example
 * ```ts
 * const client = createAiClient({ baseUrl: 'https://iefa-ai.fly.dev', token })
 * const res = await client.api.v1.sessions.$post()
 * const { session_id } = await res.json()
 * ```
 */
export function createAiClient({ baseUrl, token, headers = {} }: AiClientOptions) {
	return hc<AiAppType>(baseUrl, {
		headers: {
			...headers,
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	})
}

export type AiClient = ReturnType<typeof createAiClient>
