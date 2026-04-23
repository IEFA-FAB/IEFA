/**
 * Clientes RPC Hono para o sisub.
 *
 * Use em server functions (src/server/*.fn.ts) e handlers Nitro.
 * Não importe em código client-side — usa process.env (server-only).
 */
import { createAiClient, createApiClient } from "@iefa/hono-client"

const API_BASE_URL = process.env.IEFA_API_BASE_URL ?? "https://iefa-api.fly.dev"
const AI_BASE_URL = process.env.AI_API_BASE_URL ?? "https://iefa-ai.fly.dev"

/**
 * Cliente RPC para rotas públicas de @iefa/api.
 * Sem autenticação — dados públicos com cache público de 5 min.
 */
export const apiClient = createApiClient({ baseUrl: API_BASE_URL })

/**
 * Cria um cliente RPC para rotas admin de @iefa/api.
 * Lança erro em startup se ADMIN_SECRET não estiver configurado.
 * Use uma única instância por processo — não crie por request.
 *
 * @example
 * ```ts
 * // No topo de um server fn ou handler Nitro:
 * const admin = getAdminApiClient()
 * const res = await admin.api.admin.compras.sync.$post()
 * ```
 */
export function getAdminApiClient() {
	const adminSecret = process.env.ADMIN_SECRET
	if (!adminSecret) throw new Error("[sisub] ADMIN_SECRET não configurado — necessário para rotas admin de @iefa/api")
	return createApiClient({ baseUrl: API_BASE_URL, adminSecret })
}

/**
 * Cria um cliente RPC autenticado para @iefa/ai.
 * Passe o JWT do usuário obtido em getServerSessionFn ou authMiddleware.
 *
 * @example
 * ```ts
 * // Dentro de um server fn:
 * const { session } = await getServerSessionFn()
 * const ai = getAiClient(session?.access_token)
 * const res = await ai.api.v1.sessions.$post()
 * ```
 */
export function getAiClient(token?: string | null) {
	return createAiClient({
		baseUrl: AI_BASE_URL,
		token: token ?? undefined,
	})
}
