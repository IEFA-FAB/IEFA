/**
 * @module timeout-fetch
 * `fetch` wrapper that aborts a request after `timeoutMs`.
 *
 * Motivo: os clients Supabase (auth + PostgREST) não têm timeout próprio. No SSR,
 * `auth.getUser()` roda no `beforeLoad` da raiz de TODA rota protegida — se o GoTrue
 * (ou o gateway) travar sem responder, o request de SSR fica pendurado até o ALB
 * cortar em 60s (504) e as conexões concorrentes empilham → rajada de 502. Um fetch
 * com deadline transforma o "pendura pra sempre" num erro rápido e capturável: o
 * try/catch do __root cai pro estado não-autenticado e o fallback do _protected
 * assume, em vez de derrubar o servidor inteiro.
 *
 * Compõe com um `signal` do chamador (se houver): aborta quando QUALQUER um dispara.
 */
export function createTimeoutFetch(timeoutMs: number): typeof fetch {
	return (async (input, init = {}) => {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(new Error(`Supabase request timed out after ${timeoutMs}ms`)), timeoutMs)
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
