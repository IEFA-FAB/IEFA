/**
 * Cliente HTTP do Projeto α.
 *
 * `fetch` direto, no mesmo padrão do ChatRADA — o cliente RPC tipado
 * (`@iefa/hono-client`) foi removido do portal como código morto e não vale
 * ressuscitar por três telas internas.
 *
 * O α valida o JWT do Supabase por request, então o token é passado a cada
 * chamada em vez de memoizado: token expira.
 */

const ALPHA_BASE_URL = (import.meta.env.VITE_ALPHA_API_URL as string | undefined) ?? "https://alpha.iefa.com.br"

export async function alphaRequest<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
	const isFormData = init.body instanceof FormData

	const response = await fetch(`${ALPHA_BASE_URL}${path}`, {
		...init,
		headers: {
			// FormData define o próprio Content-Type com o boundary; sobrescrever quebra o upload.
			...(isFormData ? {} : { "Content-Type": "application/json" }),
			...(init.headers ?? {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	})

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null
		throw new Error(body?.message ?? body?.code ?? `${path}: ${response.status}`)
	}

	return (await response.json()) as T
}
