/**
 * @module transient
 * Uma falha vale tentar no modelo de reserva?
 *
 * Espelha a regra do repositório: **a reserva só troca em falha transitória** — 429, 408,
 * 5xx, throttling, timeout, queda de stream. Erro de credencial, de schema ou de
 * CAPACIDADE não é transitório, e trocar de modelo apenas repetiria a falha mais devagar.
 *
 * `No tool calls found in the response` ENTRA na lista, e a medição é a razão: o
 * `openai.gpt-oss-120b-1:0` falhou assim uma vez e acertou 6/6 logo depois, com o mesmo
 * prompt. É instabilidade de geração, não falta de capacidade — e no α custa caro, porque
 * o classificador que falha cai em `UNKNOWN`, e `UNKNOWN` responde SEM consultar o corpus.
 */

const RETRYABLE = [
	/no tool calls found/i,
	/throttl/i,
	/too many requests/i,
	/rate.?limit/i,
	/timeout/i,
	/timed out/i,
	/ETIMEDOUT/i,
	/ECONNRESET/i,
	/socket hang up/i,
	/ModelStreamError/i,
	/ServiceUnavailable/i,
	/InternalServerError/i,
	/503/,
	/502/,
]

function statusOf(error: unknown): number | null {
	if (typeof error !== "object" || error === null) return null
	const candidate = error as { status?: unknown; statusCode?: unknown; $metadata?: { httpStatusCode?: unknown } }
	for (const value of [candidate.status, candidate.statusCode, candidate.$metadata?.httpStatusCode]) {
		if (typeof value === "number") return value
	}
	return null
}

function errorText(error: unknown): string {
	if (error instanceof Error) return `${error.name} ${error.message}`
	if (typeof error === "object" && error !== null) {
		const { name, message, code } = error as { name?: unknown; message?: unknown; code?: unknown }
		return [name, code, message].filter((v) => typeof v === "string").join(" ")
	}
	return String(error)
}

export function isTransientModelFailure(error: unknown): boolean {
	const status = statusOf(error)
	if (status === 429 || status === 408 || (status !== null && status >= 500)) return true

	// O nome vem ANTES de recusar por 4xx: o Bedrock manda `ModelStreamErrorException`
	// com 424, que é queda do stream do modelo — transitória, apesar do 4xx.
	//
	// Nem todo erro do SDK é `Error`: o Bedrock devolve objeto simples com `name`. Cair em
	// `String(error)` ali produziria "[object Object]", que não casa com padrão nenhum — a
	// falha transitória passaria por definitiva.
	return RETRYABLE.some((pattern) => pattern.test(errorText(error)))
}
