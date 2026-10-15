/**
 * @module timeout-fetch
 * `fetch` wrapper that aborts a request after `timeoutMs`.
 *
 * Motivo: os clients Supabase (auth + PostgREST) não têm timeout próprio. No SSR,
 * `auth.getUser()` roda no `beforeLoad` da raiz de TODA rota protegida — se o GoTrue
 * (ou o gateway) travar sem responder, o request de SSR fica pendurado até o ALB
 * cortar em 60s (504) e as conexões concorrentes empilham → rajada de 502. Um fetch
 * com deadline transforma o "pendura pra sempre" num erro rápido e capturável: o
 * try/catch da rota raiz cai pro estado não-autenticado e o fallback do layout
 * protegido assume, em vez de derrubar o servidor inteiro.
 *
 * Compõe com um `signal` do chamador (se houver): aborta quando QUALQUER um dispara.
 *
 * O deadline é por chamada de `fetch`. Ele só vale para a operação inteira porque o motivo do
 * abort é um `AbortError` (ver {@link timeoutError}).
 */
/**
 * Motivo do abort por deadline: `DOMException` de nome `AbortError` (`code` 20, `ABORT_ERR`).
 *
 * O nome não é cosmético. O `fetchWithRetry` do postgrest-js (2.117) repete GET/HEAD/OPTIONS
 * que rejeitam (até 3 vezes, esperando 1 + 2 + 4 s), exceto quando a rejeição tem nome
 * `AbortError` ou `code` `ABORT_ERR`; `TimeoutError` só escapa se o signal do PRÓPRIO chamador
 * estiver abortado, o que aqui não acontece. Com um `Error` comum o deadline era tratado como
 * falha de rede e repetido: 4 × 10 s + 7 s ≈ 47 s numa leitura travada. Com `AbortError`, a
 * leitura travada custa uma tentativa e um deadline, e a falha RÁPIDA (`ECONNRESET`, 503 de
 * cache de schema) continua sendo repetida: o pior caso fica em deadline + 7 s.
 *
 * Vale para qualquer client montado com estes `fetch`, inclusive fora do kit.
 */
function timeoutError(timeoutMs: number): DOMException {
	return new DOMException(`Supabase request timed out after ${timeoutMs}ms`, "AbortError")
}

export function createTimeoutFetch(timeoutMs: number): typeof fetch {
	return (async (input, init = {}) => {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs)
		const signal = init.signal
		const abort = () => controller.abort(signal?.reason)

		if (signal?.aborted) {
			abort()
		} else {
			signal?.addEventListener("abort", abort, { once: true })
		}

		try {
			return await fetch(input, { ...init, signal: controller.signal })
		} finally {
			clearTimeout(timer)
			signal?.removeEventListener("abort", abort)
		}
	}) as typeof fetch
}

/**
 * Deadlines dos round-trips Supabase no servidor. Sem eles, um upstream degradado
 * (GoTrue/PostgREST/gateway) pendura o SSR até o ALB cortar em 60s → 504 + empilha
 * conexão → 502. Auth roda no caminho crítico de TODO TTFB protegido → deadline
 * mais curto; dados service-role toleram um pouco mais, mas ainda limitados.
 *
 * O orçamento total é o `idle_timeout` do ALB: 60 s. Uma rota protegida encadeia
 * auth + N chamadas de dados no mesmo request, então o deadline INDIVIDUAL precisa
 * caber várias vezes dentro de 60 s — senão duas chamadas lentas em sequência já
 * estouram o balanceador e o usuário recebe 504/502 em vez da página de erro que
 * a rota raiz sabe renderizar. Com 5 s + 10 s cabem ~5 round-trips ruins antes de
 * chegar perto do corte; com os 8 s / 15 s anteriores, dois já custavam metade.
 * Medição que motivou o aperto: p95 de ~11,5 s no target group do sisub.
 *
 * Valem para TODOS os apps atrás do mesmo ALB — o modo de falha não é específico
 * do sisub, só foi diagnosticado lá primeiro.
 */
export const AUTH_FETCH_TIMEOUT_MS = 5_000
export const DATA_FETCH_TIMEOUT_MS = 10_000

/** `fetch` com o deadline de auth já aplicado. Compartilhado por processo. */
export const authTimeoutFetch = createTimeoutFetch(AUTH_FETCH_TIMEOUT_MS)

/** `fetch` com o deadline de dados já aplicado. Compartilhado por processo. */
export const dataTimeoutFetch = createTimeoutFetch(DATA_FETCH_TIMEOUT_MS)
