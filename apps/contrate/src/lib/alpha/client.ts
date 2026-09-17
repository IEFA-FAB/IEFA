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

/**
 * Host do α em produção — o mesmo `hosts` do stack `infra/alpha`.
 *
 * Fica como default, e não como variável obrigatória, porque o build do portal
 * não passa `VITE_ALPHA_API_URL` (o `Dockerfile` gerado só recebe os ARGs do
 * Supabase): em produção é sempre este valor que vai para o bundle. A variável
 * segue servindo ao dev que aponta o portal para um α local.
 */
export const DEFAULT_ALPHA_BASE_URL = "https://alpha.iefa.com.br"

export const ALPHA_BASE_URL = (import.meta.env.VITE_ALPHA_API_URL as string | undefined) ?? DEFAULT_ALPHA_BASE_URL

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

/** Teto da sonda. Sem ele, um ALB que aceita e não responde deixa a tela em "Conectando…". */
const HEALTH_TIMEOUT_MS = 5000

/**
 * Estado do α, como a interface consegue distingui-lo.
 *
 * `?deep=1` porque o dot verde promete que dá para perguntar: o nível raso do
 * `/health` só mede memória do processo, e o α responderia "ok" com o banco fora,
 * sem sessão para gravar nem trecho de norma para recuperar.
 *
 * Sem token: a sonda é pública, e exigir sessão faria o visitante deslogado ver
 * "Offline" num serviço no ar.
 */
export async function fetchAlphaHealth(): Promise<"ok" | "error"> {
	try {
		const response = await fetch(`${ALPHA_BASE_URL}/health?deep=1`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
		const body = (await response.json().catch(() => null)) as { status?: string } | null
		return response.ok && body?.status === "ok" ? "ok" : "error"
	} catch {
		// Rede fora, CORS ausente, timeout: para quem olha a tela é tudo a mesma coisa.
		return "error"
	}
}
