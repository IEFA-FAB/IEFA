import type { AppType as ApiAppType } from "@iefa/api"
import { hc } from "hono/client"

export type { ApiAppType }

export type ApiClientOptions = {
	baseUrl: string
	/** x-admin-secret header — somente para rotas admin */
	adminSecret?: string
	headers?: Record<string, string>
}

/**
 * Cria um cliente RPC tipado para o @iefa/api (porta 3000).
 *
 * @example
 * ```ts
 * const client = createApiClient({ baseUrl: 'https://iefa-api.fly.dev' })
 * const res = await client.api.units.$get()
 * const units = await res.json() // Unit[]
 * ```
 */
export function createApiClient({ baseUrl, adminSecret, headers = {} }: ApiClientOptions) {
	return hc<ApiAppType>(baseUrl, {
		headers: {
			...headers,
			...(adminSecret ? { "x-admin-secret": adminSecret } : {}),
		},
	})
}

export type ApiClient = ReturnType<typeof createApiClient>
