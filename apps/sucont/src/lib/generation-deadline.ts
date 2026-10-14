/**
 * @module generation-deadline
 * Prazo de uma chamada ao modelo que CANCELA a geração no provider, em vez de só parar de
 * esperar por ela.
 *
 * Um `Promise.race` com um timer devolvia a mensagem de prazo e deixava o modelo gerando até
 * o fim: a resposta que ninguém ia ler continuava na fatura. Aqui o prazo e quem pediu (a
 * requisição do cliente, o `cancel` de um stream SSE) abortam o MESMO `AbortController`, que
 * vai para o adapter em `chatOptions.abortController`; o adapter do Bedrock o repassa ao SDK.
 *
 * O timer e o listener são sempre desfeitos: uma competência do SAC-DGC são dezenas de
 * análises em sequência, e um timer de minutos vivo por análise segura o processo.
 *
 * Puro de propósito: serve às server functions (`#/lib/ai.server`) e às rotas Nitro, e o teste
 * roda sem modelo e sem request.
 */

export interface GenerationDeadlineOptions {
	/** Milissegundos até abortar a geração. */
	deadlineMs: number
	/** Mensagem do erro lançado quando o prazo vence — é o que chega à tela. */
	timeoutMessage: string
	/** Sinal de quem pediu. Abortado, a geração é abortada junto. */
	signal?: AbortSignal
	/** Mensagem do erro quando quem abortou foi o `signal`. */
	cancelledMessage?: string
}

const DEFAULT_CANCELLED_MESSAGE = "A geração foi cancelada antes de terminar."

/**
 * Roda `run` com um `AbortController` que aborta no prazo ou quando `signal` abortar.
 *
 * O race com o abort garante o prazo mesmo se um adapter ignorar o signal. Rejeição depois do
 * abort vira o erro do prazo (ou do cancelamento), não o "Request aborted" do SDK.
 */
export async function withGenerationDeadline<T>(options: GenerationDeadlineOptions, run: (controller: AbortController) => Promise<T>): Promise<T> {
	const { deadlineMs, timeoutMessage, signal, cancelledMessage = DEFAULT_CANCELLED_MESSAGE } = options
	const controller = new AbortController()
	let timedOut = false
	const abortError = () => new Error(timedOut ? timeoutMessage : cancelledMessage)

	const aborted = new Promise<never>((_, reject) => {
		controller.signal.addEventListener("abort", () => reject(abortError()), { once: true })
	})

	const timer = setTimeout(() => {
		timedOut = true
		controller.abort()
	}, deadlineMs)
	const onCallerAbort = () => controller.abort()
	if (signal?.aborted) controller.abort()
	else signal?.addEventListener("abort", onCallerAbort, { once: true })

	try {
		return await Promise.race([run(controller), aborted])
	} catch (error) {
		if (controller.signal.aborted) throw abortError()
		throw error
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener("abort", onCallerAbort)
	}
}
