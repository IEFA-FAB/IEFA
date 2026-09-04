/**
 * Cadeia de fallback entre adapters de IA.
 *
 * Por que não bastava um try/catch em volta do `chatStream`: os adapters em cima do
 * `@tanstack/openai-base` (groq, nvidia, openrouter) NÃO lançam quando o provider falha —
 * eles capturam o erro internamente e emitem um evento `RUN_ERROR` no stream. Só o adapter
 * do bedrock lança de verdade. Uma cadeia que só observasse exceções, portanto, nunca
 * dispararia com groq no primário.
 *
 * A troca também não pode acontecer a qualquer momento: se o primário já emitiu texto ou
 * abriu uma tool call, recomeçar no reserva duplicaria `RUN_STARTED` e repetiria conteúdo
 * que o usuário já viu. Por isso os eventos ficam represados até o primeiro ponto de
 * commit; antes dele, a troca é invisível — depois dele, o erro é propagado.
 */

import type { AnyTextAdapter, StreamChunk } from "@tanstack/ai"
import { withAdapterModel } from "./own-model.js"

/**
 * Primeiro evento que torna a troca de adapter visível ao usuário. Até aqui só passaram
 * eventos de protocolo (RUN_STARTED, TEXT_MESSAGE_START), que o reserva reemite.
 */
const COMMIT_EVENT_TYPES = new Set(["TEXT_MESSAGE_CONTENT", "TOOL_CALL_START", "TOOL_CALL_ARGS", "REASONING_MESSAGE_CONTENT", "TOOL_CALL_END"])

const RETRYABLE_PATTERNS = [
	/throttl/i,
	/too many requests/i,
	/rate.?limit/i,
	// Os nomes do SDK da AWS vêm colados ("ServiceUnavailableException"), então os padrões
	// não podem exigir o espaço.
	/service.?unavailable/i,
	/internal.?server/i,
	/model.?stream.?error/i,
	/overloaded/i,
	/model.?not.?ready/i,
	/timed? ?out/i,
	/timeout/i,
	/econnreset/i,
	/econnrefused/i,
	/socket hang up/i,
	/fetch failed/i,
	/network error/i,
	// Frase do SDK da AWS quando o transporte morre antes de qualquer resposta
	// ("Unexpected error: http2 request did not get a response"). Não casava com
	// nenhum padrão acima, então a reserva NÃO entrava justamente na falha de
	// transporte do primário — que é o Bedrock, o caso mais provável.
	/did not get a response/i,
]

/**
 * O status HTTP, onde quer que o provider o tenha escondido.
 *
 * `$metadata.httpStatusCode` é o do SDK da AWS — e é o que importa mais aqui, porque o
 * bedrock é o primário e o único adapter que lança de verdade. Sem ler esse campo, um 503
 * do Bedrock não acionava a reserva: caía no teste por mensagem, que não casava com
 * `InternalServerException`.
 */
function statusOf(value: unknown): number | undefined {
	const v = value as { status?: unknown; statusCode?: unknown; $metadata?: { httpStatusCode?: unknown }; rawEvent?: { status_code?: unknown } } | null
	const raw = v?.status ?? v?.statusCode ?? v?.$metadata?.httpStatusCode ?? v?.rawEvent?.status_code
	return typeof raw === "number" ? raw : undefined
}

function textOf(value: unknown): string {
	if (value == null) return ""
	if (typeof value === "string") return value
	const v = value as { message?: unknown; code?: unknown; name?: unknown; error?: { message?: unknown; code?: unknown } }
	return [v.message, v.code, v.name, v.error?.message, v.error?.code].filter((p): p is string => typeof p === "string").join(" ")
}

/**
 * Erro/`RUN_ERROR` transitório — vale tentar o próximo adapter. Erro de schema, de
 * autenticação ou de tool malformada não é: trocar de provider só repetiria a falha.
 */
export function isRetryableAdapterFailure(value: unknown): boolean {
	const status = statusOf(value)
	if (status === 429 || status === 408 || (status != null && status >= 500)) return true

	// O nome é consultado ANTES de recusar por 4xx: o Bedrock manda `ModelStreamErrorException`
	// com 424 (Failed Dependency), que é falha do stream do modelo — transitória, apesar do 4xx.
	if (RETRYABLE_PATTERNS.some((re) => re.test(textOf(value)))) return true

	return false
}

/** Marcador interno: um `RUN_ERROR` transitório visto antes do commit vira exceção para acionar a troca. */
class RunErrorSignal extends Error {
	constructor(readonly chunk: StreamChunk) {
		super("run-error")
		this.name = "RunErrorSignal"
	}
}

/**
 * Encadeia adapters: o primeiro que conseguir começar a responder atende o turno.
 *
 * A troca acontece quando, ANTES do primeiro conteúdo, o adapter lança ou emite um
 * `RUN_ERROR` transitório (429, 5xx, throttling, timeout, queda de conexão). Depois do
 * primeiro conteúdo o erro é propagado: meia resposta de um modelo mais meia de outro é
 * pior que uma falha honesta.
 */
export function withFallbackChain(primary: AnyTextAdapter, ...fallbacks: AnyTextAdapter[]): AnyTextAdapter {
	// `forceAdapterModel` e não `withAdapterModel`: a activity `chat()` lê
	// `adapter.model` do objeto encadeado — que é o do PRIMÁRIO, porque o spread
	// abaixo o copia — e injeta esse id em `options.model`. Sem sobrescrever por
	// adapter, a reserva recebe o modelo do primário e responde 404: ela serve outro.
	const adapters = [primary, ...fallbacks].filter(Boolean).map((adapter) => withAdapterModel(adapter, { force: true }))
	if (adapters.length === 1) return primary

	return {
		...primary,
		chatStream: async function* (options) {
			let lastFailure: unknown
			for (let i = 0; i < adapters.length; i++) {
				const adapter = adapters[i]
				const isLast = i === adapters.length - 1
				const buffered: StreamChunk[] = []
				let committed = false

				try {
					for await (const chunk of adapter.chatStream(options)) {
						const type = (chunk as { type?: string }).type

						if (!committed && type === "RUN_ERROR" && !isLast && isRetryableAdapterFailure(chunk)) {
							throw new RunErrorSignal(chunk)
						}

						if (committed) {
							yield chunk
							continue
						}

						buffered.push(chunk)
						if (type && COMMIT_EVENT_TYPES.has(type)) {
							committed = true
							for (const held of buffered) yield held
							buffered.length = 0
						}
					}

					// Stream terminou sem conteúdo (ex.: só RUN_STARTED/RUN_FINISHED): entrega o que veio.
					for (const held of buffered) yield held
					return
				} catch (error) {
					const failure = error instanceof RunErrorSignal ? error.chunk : error
					if (committed || isLast) {
						if (error instanceof RunErrorSignal) {
							yield error.chunk
							return
						}
						throw error
					}
					if (!(error instanceof RunErrorSignal) && !isRetryableAdapterFailure(error)) throw error
					lastFailure = failure
				}
			}

			// Inalcançável: o último adapter sempre propaga. Guardado para não engolir falha em silêncio.
			throw lastFailure instanceof Error ? lastFailure : new Error("Todos os providers de IA falharam")
		},
		structuredOutput: async (options) => {
			let lastError: unknown
			for (let i = 0; i < adapters.length; i++) {
				try {
					return await adapters[i].structuredOutput(options)
				} catch (error) {
					if (i === adapters.length - 1 || !isRetryableAdapterFailure(error)) throw error
					lastError = error
				}
			}
			throw lastError instanceof Error ? lastError : new Error("Todos os providers de IA falharam")
		},
	} as AnyTextAdapter
}
