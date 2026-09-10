import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { defineHandler } from "nitro"
import { type H3Event, HTTPError, readBody } from "nitro/h3"
import { buildAnalyticNoteMarkdown } from "#/auditor/services/report-markdown"
import { ANALYTIC_NOTE_SYSTEM_PROMPT, buildAnalyticNoteUserPrompt } from "#/auditor/services/report-prompt"
import { analyticNoteRequestSchema } from "#/auditor/services/report-request"
import { analyticNoteJsonSchema, normalizeAnalyticNote } from "#/auditor/services/report-schema"
import { silentAdapterLogger } from "#/lib/ai-logger"
import { getServerCapabilities } from "#/lib/capabilities.server"
import { requireSucontUser } from "#/lib/nitro-auth.server"

/**
 * Nota Analítica Estratégica de UMA competência do auditor SIAFI × SILOMS.
 *
 * É SSE pelo mesmo motivo do SAC-DGC: o `idle_timeout` de 60 s do ALB
 * compartilhado. Uma nota de sete seções passa disso com folga e uma resposta
 * única seria cortada como 502 sem mensagem. Aqui a conexão recebe um comentário
 * de keep-alive a cada 15 s enquanto o modelo trabalha.
 *
 * O recorte numérico chega pronto do navegador (ver `report-request.ts`) e é
 * validado aqui. O modelo produz só a prosa; o Markdown final é montado NO
 * SERVIDOR, por `buildAnalyticNoteMarkdown`, para que exista um único caminho até
 * o documento — a tela não tem como emitir uma nota que não passe pelo montador.
 *
 * Nível 1 no módulo `sucont-4` basta: a nota é leitura da série, não escrita. Nada
 * aqui persiste.
 *
 * Eventos emitidos:
 *   `start`   { competence }                  — pedido aceito, geração iniciada
 *   `done`    { markdown, note }              — nota montada
 *   `failed`  { message }                     — falha depois do stream aberto (não há mais status HTTP)
 */

/** Intervalo do keep-alive. Precisa ser confortavelmente menor que os 60 s do ALB. */
const HEARTBEAT_MS = 15_000

/** Teto por nota. Sem ele um travamento no provider segura a conexão para sempre. */
const DEADLINE_MS = 180_000

/** Orçamento de saída. Sete seções de prosa giram em 3–4 mil tokens; o dobro cobre a competência mais carregada. */
const MAX_OUTPUT_TOKENS = 8_000

export default defineHandler(async (event: H3Event) => {
	if (!getServerCapabilities().oracle) {
		throw new HTTPError({ status: 503, message: "Nota analítica indisponível — IA não configurada neste ambiente" })
	}

	// O guard de rota do __root é client-side: não alcança esta rota Nitro. Sem a
	// checagem aqui, o endpoint seria um caminho aberto para o Bedrock da conta.
	//
	// A divisão é a da tela que a chama: a nota analítica é do Auditor SIAFI × SILOMS,
	// que é da SUCONT-4. Aceitá-la de qualquer divisão faria desta rota o caminho que
	// ignora o split — quem tem só a SUCONT-1 ou a SUCONT-3 queimaria Bedrock por um
	// documento cuja tela ele não abre.
	const user = await requireSucontUser(event, ["sucont-4"])

	const parsed = analyticNoteRequestSchema.safeParse(await readBody(event))
	if (!parsed.success) {
		throw new HTTPError({ status: 400, message: "Recorte da competência inválido — recarregue a tela e tente novamente." })
	}
	const dataset = parsed.data

	// Teto de requisições ANTES de abrir o SSE: depois que o stream começa não há
	// mais status HTTP para devolver, e o erro viraria conexão cortada sem mensagem.
	try {
		enforceRequestRateLimit("SUCONT", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// `Retry-After` vai DENTRO do erro. O h3 v2 monta a resposta de erro a
			// partir de `error.headers`; um `setResponseHeader` no event é descartado
			// nesse caminho, e o cliente recebe o 429 sem saber quanto esperar.
			throw new HTTPError({
				status: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	const adapter = createAdapterFromEnv("SUCONT", { rateLimitKey: user.id })

	type StructuredArgs = Parameters<typeof adapter.structuredOutput>[0]
	const chatOptions = {
		messages: [{ role: "user", content: buildAnalyticNoteUserPrompt(dataset) }],
		systemPrompts: [ANALYTIC_NOTE_SYSTEM_PROMPT],
		modelOptions: {
			// Sete seções de prosa passam do teto padrão do Converse. Sem isto a
			// resposta é cortada no meio de uma string, o JSON não fecha, e o erro que
			// chega é "falha ao parsear" — que não diz nada sobre a causa.
			maxTokens: MAX_OUTPUT_TOKENS,
			// Nota institucional sobre a mesma competência não pode variar entre duas
			// execuções: a segunda leitura precisa poder ser confrontada com a primeira.
			temperature: 0,
		},
		// Obrigatório: os adapters do TanStack chamam `logger.request`/`logger.errors`
		// sem guarda. Ver `#/lib/ai-logger`.
		logger: silentAdapterLogger,
	} as unknown as StructuredArgs["chatOptions"]

	// Preenchido no `start` e chamado no `cancel` — o `cancel` do ReadableStream não
	// enxerga o escopo do `start`.
	let cancelGeneration: (() => void) | undefined

	const encoder = new TextEncoder()
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false
			// Fechar a aba, apertar "Interromper" ou perder a rede cancela o stream. Sem
			// esta guarda o heartbeat seguiria chamando `enqueue` num controller morto.
			const send = (name: string, payload: unknown) => {
				if (closed) return
				try {
					controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`))
				} catch {
					closed = true
				}
			}

			send("start", { competence: dataset.competence })

			const heartbeat = setInterval(() => {
				if (closed) return
				try {
					controller.enqueue(encoder.encode(": keep-alive\n\n"))
				} catch {
					closed = true
				}
			}, HEARTBEAT_MS)

			// Cliente foi embora: aborta a geração em vez de deixá-la correr até o
			// deadline. Sem isto o modelo termina a saída inteira e o consumo entra no
			// teto do usuário por um documento que ninguém vai ler.
			const generation = new AbortController()
			let deadlineTimer: ReturnType<typeof setTimeout> | undefined

			const finish = () => {
				closed = true
				clearInterval(heartbeat)
				if (deadlineTimer) clearTimeout(deadlineTimer)
			}

			cancelGeneration = () => {
				generation.abort()
				finish()
			}

			const deadline = new Promise<never>((_, reject) => {
				deadlineTimer = setTimeout(() => {
					generation.abort()
					reject(new Error("A geração da nota excedeu o tempo máximo de espera. Tente novamente."))
				}, DEADLINE_MS)
			})

			const generated = adapter
				.structuredOutput({
					chatOptions: { ...(chatOptions as object), abortController: generation } as StructuredArgs["chatOptions"],
					outputSchema: analyticNoteJsonSchema as unknown as StructuredArgs["outputSchema"],
				})
				.then((result) => {
					const note = normalizeAnalyticNote(result.data)
					return { note, markdown: buildAnalyticNoteMarkdown(dataset, note) }
				})

			Promise.race([generated, deadline])
				.then((payload) => send("done", payload))
				.catch((error: unknown) => send("failed", { message: error instanceof Error ? error.message : "Falha ao gerar a nota analítica." }))
				.finally(() => {
					const wasClosed = closed
					finish()
					if (!wasClosed) {
						try {
							controller.close()
						} catch {
							// stream já encerrado pelo cliente
						}
					}
				})
		},
		cancel() {
			cancelGeneration?.()
		},
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			// O ALB e o CloudFront bufferizam SSE sem isto e o keep-alive nunca chega ao cliente.
			"X-Accel-Buffering": "no",
		},
	})
})
