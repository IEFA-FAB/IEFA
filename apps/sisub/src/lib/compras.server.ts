/**
 * @module compras.server
 * Client tipado do Compras.gov.br para o sisub — fonte única.
 *
 * Antes cada consumidor montava a URL na mão com `URLSearchParams` e repetia a
 * mesma função `fetchCompras`. Três deles derivaram para nomes de parâmetro que
 * a API não tem e passaram a responder 404 em 100% das chamadas, em silêncio:
 * `1_consultarARP`/`2_consultarARPItem` (`uasgGerenciadora`/`numeroAta`/`anoAta`,
 * que na verdade são de `4_consultarEmpenhosSaldoItem`) e
 * `1_consultarFornecedor` (sem o obrigatório `ativo`). Com o client gerado do
 * swagger, os três viram erro de compilação.
 */

import { createComprasClient } from "@iefa/compras-api"

const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

/**
 * Fetch com backoff exponencial (0s, 1s, 3s) e timeout por tentativa.
 *
 * Só repete falha de transporte e 5xx/408/429. Um 4xx é determinístico —
 * repetir um 404 de parâmetro errado três vezes só atrasa o erro e triplica a
 * carga na API pública.
 */
async function retryingFetch(input: Request): Promise<Response> {
	let lastErr: unknown
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
		try {
			// O Request só pode ser consumido uma vez; clonar antes de cada tentativa.
			const res = await fetch(input.clone(), { signal: AbortSignal.timeout(TIMEOUT_MS) })
			if (res.ok) return res
			const retryable = res.status === 408 || res.status === 429 || res.status >= 500
			if (!retryable) return res
			lastErr = new Error(`HTTP ${res.status} ao consultar Compras.gov.br`)
		} catch (err) {
			lastErr = err
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error("Falha ao consultar Compras.gov.br")
}

export const comprasApi = createComprasClient(retryingFetch as typeof fetch)

/**
 * Converte o `{ data, error }` do openapi-fetch em valor ou exceção.
 *
 * A API mistura formatos de erro: 404 vem em JSON (`{statusCode, message}`) e
 * 400 vem em `text/plain` ("Informe um número de paginação no intervalo de 10 a
 * 500"). Os dois caem aqui como `error`, e a mensagem precisa sobreviver ao log.
 */
export function unwrapCompras<T>(result: { data?: T; error?: unknown; response: Response }): T {
	if (result.data !== undefined) return result.data
	const { response, error } = result
	const detail =
		typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : ""
	throw new Error(`Compras.gov.br retornou ${response.status}${detail ? `: ${detail}` : ""}`)
}
