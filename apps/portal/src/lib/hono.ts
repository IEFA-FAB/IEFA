import { createAlphaClient, createApiClient } from "@iefa/hono-client"

/**
 * Cliente RPC para @iefa/api (dados públicos: unidades, refeitórios, previsões…)
 *
 * Usa VITE_IEFA_API_URL do ambiente (VITE_ = exposto ao browser via Vite).
 * Fallback: https://iefa-api.fly.dev
 */
export const apiClient = createApiClient({
	baseUrl: (import.meta.env.VITE_IEFA_API_URL as string | undefined) ?? "https://iefa-api.fly.dev",
})

/**
 * Cria um cliente RPC autenticado para @iefa/alpha (Projeto α).
 *
 * Chame dentro de handlers/componentes que já possuem o token JWT do usuário.
 * Não persista — tokens expiram; crie sob demanda.
 *
 * @example
 * ```ts
 * const { data: { session } } = await supabase.auth.getSession()
 * const alpha = getAlphaClient(session?.access_token)
 * const res = await alpha.api.v1.sessions.$post()
 * ```
 */
export function getAlphaClient(token?: string | null) {
	return createAlphaClient({
		baseUrl: (import.meta.env.VITE_ALPHA_API_URL as string | undefined) ?? "https://iefa-ai.fly.dev",
		token: token ?? undefined,
	})
}
