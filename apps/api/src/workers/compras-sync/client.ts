import type { ComprasPage } from "./types.ts"

const BASE_URL = "https://dadosabertos.compras.gov.br"
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000]
const REQUEST_TIMEOUT_MS = 30_000
const PAGE_DELAY_MS = 100

async function fetchPageWithRetry<T>(url: string): Promise<ComprasPage<T>> {
	let lastError: unknown
	for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				headers: { accept: "*/*" },
			})
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
			return (await res.json()) as ComprasPage<T>
		} catch (err) {
			lastError = err
			if (attempt < RETRY_DELAYS_MS.length) {
				await Bun.sleep(RETRY_DELAYS_MS[attempt])
			}
		}
	}
	throw lastError
}

/**
 * AsyncGenerator que entrega uma página por vez.
 * Nunca acumula todas as páginas em memória.
 * Aplica um delay de 100ms entre requisições como cortesia à API pública.
 */
export async function* fetchAllPages<T>(
	endpoint: string,
	params: Record<string, string | number> = {}
): AsyncGenerator<{ page: ComprasPage<T>; pageNumber: number }> {
	let pagina = 1
	while (true) {
		const qs = new URLSearchParams({
			...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
			pagina: String(pagina),
			tamanhoPagina: "500",
		})
		const url = `${BASE_URL}/${endpoint}?${qs}`
		const page = await fetchPageWithRetry<T>(url)
		yield { page, pageNumber: pagina }
		if (page.paginasRestantes === 0) break
		pagina++
		await Bun.sleep(PAGE_DELAY_MS)
	}
}
