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
 * Caminho do α com cada valor interpolado codificado: alphaPath`/api/v1/submissions/${id}/text`.
 *
 * Os ids vêm de parâmetro de rota da URL do contrate — o usuário os escreve. Interpolado
 * cru, um `../aci/queue` ou um `?` no id reescrevia a chamada que o browser faz ao α com o
 * token da pessoa. Codificado, ele é sempre UM segmento.
 */
export function alphaPath(strings: TemplateStringsArray, ...values: Array<string | number | boolean>): string {
	return strings.reduce((path, chunk, index) => path + chunk + (index < values.length ? encodeURIComponent(String(values[index])) : ""), "")
}

/**
 * Erro de uma chamada ao α, com o status e o `code` da resposta. Continua sendo `Error`, com a
 * mesma mensagem de antes — quem só lê `message` não muda —, e quem precisa distinguir 429 de
 * 403 (o chat) lê `status`/`code` em vez de adivinhar pelo texto.
 */
export class AlphaRequestError extends Error {
	readonly status: number
	readonly code: string | null
	readonly body: Record<string, unknown> | null

	constructor(message: string, status: number, body: Record<string, unknown> | null) {
		super(message)
		this.name = "AlphaRequestError"
		this.status = status
		this.code = typeof body?.code === "string" ? body.code : null
		this.body = body
	}
}

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
		const body = (await response.json().catch(() => null)) as ({ message?: string; code?: string } & Record<string, unknown>) | null
		throw new AlphaRequestError(body?.message ?? body?.code ?? `${path}: ${response.status}`, response.status, body)
	}

	// 204 (o DELETE do chat) não tem corpo: `response.json()` lançaria depois do sucesso.
	if (response.status === 204) return undefined as T
	return (await response.json()) as T
}
