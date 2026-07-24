/**
 * fetch com retry para downloads de fontes públicas (backoff exponencial + jitter).
 *
 * Mesma família dos retries de `workers/compras-sync/client.ts` e
 * `workers/pesquisa-preco/client.ts`, mas genérico: retenta em erro de rede e
 * em respostas transitórias (408/429/5xx).
 *
 * Contrato com o caller:
 * - Resposta não-retentável (404, 403…) é devolvida como está — o caller decide
 *   via `res.ok`, preservando as mensagens de erro existentes.
 * - Se todas as tentativas de um status retentável falharem, a ÚLTIMA resposta
 *   é devolvida (mesma razão — o caller reporta o HTTP status).
 * - Erro de rede persistente relança o último erro.
 */

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 2_000
const RETRYABLE_HTTP_CODES = new Set([408, 429, 500, 502, 503, 504])

export interface FetchRetryOptions {
	/** Total de tentativas (1 = sem retry). Default: 4. */
	maxAttempts?: number
	/** Delay base do backoff exponencial (`base * 2**(tentativa-1)`). Default: 2s. */
	baseDelayMs?: number
	/** Prefixo dos logs de retry. Default: host da URL. */
	label?: string
}

/** Jitter ±25% — evita sincronizar retries de downloads concorrentes. */
function withJitter(ms: number): number {
	return Math.round(ms * (0.75 + Math.random() * 0.5))
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, options: FetchRetryOptions = {}): Promise<Response> {
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
	const label = options.label ?? new URL(url).host

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let failure: string
		try {
			const res = await fetch(url, init)
			if (res.ok || !RETRYABLE_HTTP_CODES.has(res.status)) return res
			// Esgotou: devolve a resposta transitória pro caller tratar via res.ok
			if (attempt === maxAttempts) return res
			failure = `HTTP ${res.status}`
			// Descarta o body antes do retry pra liberar a conexão
			await res.body?.cancel().catch(() => {})
		} catch (err) {
			if (attempt === maxAttempts) throw err
			failure = err instanceof Error ? err.message : String(err)
		}

		const delay = withJitter(baseDelayMs * 2 ** (attempt - 1))
		console.warn(`[fetch-retry] ${label}: tentativa ${attempt}/${maxAttempts} falhou (${failure}) — retry em ${delay}ms`)
		await Bun.sleep(delay)
	}

	// Inalcançável com maxAttempts >= 1 — guarda de fluxo pro TypeScript
	throw new Error(`fetchWithRetry: tentativas esgotadas para ${url}`)
}
