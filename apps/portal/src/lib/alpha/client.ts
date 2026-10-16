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

/**
 * Caminho do α com cada valor interpolado codificado: alphaPath`/api/v1/sessions/${id}/messages`.
 *
 * Os ids do ChatRADA não são confiáveis: o `session_id` sai do localStorage e o id de chunk
 * sai de `cited_documents`, que é resposta do modelo. Interpolado cru, um `../` ou um `?`
 * no id reescrevia a chamada que o browser faz ao α com o token da pessoa. Codificado, ele
 * é sempre UM segmento; `.`, `..` e vazio são recusados.
 *
 * Cópia do `alphaPath` do contrate (`apps/contrate/src/lib/alpha/client.ts`): correção aqui
 * vale lá. Não foi para `@iefa/alpha-client` porque o portal não depende desse package, e
 * passar a depender regenera o Dockerfile e o `.github/paths-filter.yml`, que é gate.
 */
export function alphaPath(strings: TemplateStringsArray, ...values: Array<string | number | boolean>): string {
	return strings.reduce((path, chunk, index) => path + chunk + (index < values.length ? encodeAlphaSegment(values[index]) : ""), "")
}

/**
 * `encodeURIComponent` mantém `.` e `..` como estão, e o parser de URL do `fetch` os resolve
 * como segmento de ponto: `/api/v1/sessions/../messages` vira `/api/v1/messages`. Vazio
 * colapsa o segmento (`/sessions//messages`). Nenhum id legítimo tem essa forma: recusa.
 */
function encodeAlphaSegment(value: string | number | boolean): string {
	const encoded = encodeURIComponent(String(value))
	if (encoded === "" || encoded === "." || encoded === "..") throw new Error(`alphaPath: valor inválido no caminho do α: "${encoded}"`)
	return encoded
}

/** URL absoluta de um caminho do α. O caminho com id sai de {@link alphaPath}. */
export function alphaUrl(path: string): string {
	return `${ALPHA_BASE_URL}${path}`
}

/** `Authorization` com o token da sessão; vazio sem token (o α responde 401). */
export function alphaAuthHeader(token: string | undefined): Record<string, string> {
	return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function alphaRequest<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
	const isFormData = init.body instanceof FormData

	const response = await fetch(alphaUrl(path), {
		...init,
		headers: {
			// FormData define o próprio Content-Type com o boundary; sobrescrever quebra o upload.
			...(isFormData ? {} : { "Content-Type": "application/json" }),
			...(init.headers ?? {}),
			...alphaAuthHeader(token),
		},
	})

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null
		throw new Error(body?.message ?? body?.code ?? `${path}: ${response.status}`)
	}

	return (await response.json()) as T
}
