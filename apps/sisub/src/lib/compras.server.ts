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

/**
 * Fetch com backoff exponencial e timeout por tentativa.
 *
 * Só repete falha de transporte e 5xx/408/429. Um 4xx é determinístico —
 * repetir um 404 de parâmetro errado três vezes só atrasa o erro e triplica a
 * carga na API pública.
 */
function retryingFetch({ timeoutMs, attempts }: { timeoutMs: number; attempts: number }) {
	return async (input: Request): Promise<Response> => {
		let lastErr: unknown
		for (let attempt = 0; attempt < attempts; attempt++) {
			if (attempt > 0) await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
			try {
				// O Request só pode ser consumido uma vez; clonar antes de cada tentativa.
				const res = await fetch(input.clone(), { signal: AbortSignal.timeout(timeoutMs) })
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
}

/** Consulta iniciada pelo usuário, com tela esperando: até ~93 s no pior caso. */
export const comprasApi = createComprasClient(retryingFetch({ timeoutMs: 30_000, attempts: 3 }) as typeof fetch)

/**
 * Client com orçamento curto para o caminho de EMISSÃO de OF.
 *
 * A consulta ao SICAF é advisória — falha degrada para `indeterminado` e o
 * gestor decide com registro. Ela roda dentro do handler de emissão, atrás do
 * ALB, cujo idle timeout é de 60 s: com a política normal (3 × 30 s), e sendo
 * duas consultas em sequência, o pior caso passa de 180 s e o usuário recebe
 * 502 em vez do `indeterminado` que o fluxo promete. Uma tentativa de 8 s por
 * consulta mantém o pior caso em ~16 s, com folga para o resto da emissão.
 */
export const comprasApiFast = createComprasClient(retryingFetch({ timeoutMs: 8_000, attempts: 1 }) as typeof fetch)

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
