/**
 * @module retry
 * Política de retentativa dos clientes LangChain.
 *
 * ─── O que isto conserta ──────────────────────────────────────────────────────
 * O `AsyncCaller` do LangChain envolve toda chamada de modelo e retenta **6 vezes**
 * por padrão, com backoff exponencial. A lista dele de "não retentar" é por status
 * HTTP e lê `error.status` ou `error.response.status` — campos que o SDK v3 da AWS
 * NÃO usa: lá o status mora em `$metadata.httpStatusCode`. O resultado é que um erro
 * permanente do Bedrock fica invisível para a guarda e é retentado como se fosse
 * instabilidade.
 *
 * Foi assim que uma `AccessDeniedException` no modelo de embedding — permanente, e
 * marcada pelo próprio SDK como `$retryable: undefined` — virou perguntas de **5 e 6
 * minutos** em produção, com intervalos medidos de 2 s, 4 s, 8 s, 15 s e 26 s entre as
 * tentativas. O usuário via a conexão morrer no minuto 1; o servidor seguia gastando
 * Bedrock por mais cinco.
 *
 * ─── Por que 2, e não 6 ───────────────────────────────────────────────────────
 * O orçamento do turno é o timeout de 60 s do SSE. Seis retentativas com backoff
 * exponencial gastam ~1 minuto sozinhas, ou seja, o turno inteiro numa chamada só.
 * Duas cabem em poucos segundos e ainda absorvem o caso que a retentativa existe para
 * absorver: throttling e queda de stream.
 */
import { isTransientModelFailure } from "./transient.ts"

/** Teto de retentativas por chamada de modelo. Ver o porquê no cabeçalho. */
export const MAX_MODEL_RETRIES = 2

/**
 * Cancelamento não é falha de modelo — é a resposta deixando de ser necessária.
 *
 * Precisa sair na frente porque a mensagem de aborto varia entre runtimes e algumas
 * carregam a palavra "timeout", que a classificação de transitório reconheceria. Um
 * turno abortado que fosse retentado gastaria justamente o que o aborto foi pedir.
 */
function isAbort(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false
	const name = (error as { name?: unknown }).name
	return name === "AbortError" || name === "TimeoutError"
}

/**
 * Handler de tentativa falha: deixa retentar só o que é transitório.
 *
 * Lançar aqui interrompe a retentativa e propaga o erro — é o contrato do
 * `onFailedAttempt`. Retornar deixa o `AsyncCaller` seguir com o backoff.
 */
export function stopUnlessTransient(error: unknown): void {
	if (isAbort(error)) throw error
	if (isTransientModelFailure(error)) return
	throw error
}

/** O que todo cliente LangChain do α recebe no construtor. */
export const MODEL_RETRY_POLICY = {
	maxRetries: MAX_MODEL_RETRIES,
	onFailedAttempt: stopUnlessTransient,
} as const
