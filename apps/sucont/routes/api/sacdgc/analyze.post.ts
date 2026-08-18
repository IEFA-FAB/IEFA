import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { defineHandler } from "nitro"
import { createError, type H3Event, readBody } from "nitro/h3"
import { silentAdapterLogger } from "#/lib/ai-logger"
import { getServerCapabilities } from "#/lib/capabilities.server"
import { requireSucontUser } from "#/lib/nitro-auth.server"
import { buildDgcUserPrompt, DGC_SYSTEM_PROMPT } from "#/sacdgc/prompt"
import { dgcAnalysisRequestSchema } from "#/sacdgc/request"
import { dgcAnalysisSchema, normalizeDgcAnalysis } from "#/sacdgc/schema"
import type { PanelId } from "#/sacdgc/types"

/**
 * Análise crítica de UMA UG do DGC.
 *
 * É SSE, e não uma server function, por causa do `idle_timeout` de 60 s do ALB
 * compartilhado: a geração de uma análise completa (4 painéis + 20 itens de
 * checklist + alertas) passa disso com frequência, e uma resposta única passaria a
 * ser cortada como 502 sem mensagem. Aqui a conexão recebe um comentário de
 * keep-alive a cada 15 s enquanto o modelo trabalha, então nunca fica ociosa.
 *
 * Eventos emitidos:
 *   `start`   { ugCode }                — pedido aceito, geração iniciada
 *   `done`    DgcAnalysis               — análise normalizada
 *   `failed`  { message }               — falha depois do stream aberto (não há mais status HTTP)
 */

/** Intervalo do keep-alive. Precisa ser confortavelmente menor que os 60 s do ALB. */
const HEARTBEAT_MS = 15_000

/** Teto por UG. Acima disso a chamada é abandonada — sem ele um travamento no provider segura a conexão para sempre. */
const DEADLINE_MS = 300_000

/** Orçamento de saída. Uma análise cheia gira em 6–10 mil tokens; o dobro cobre a UG mais carregada. */
const MAX_OUTPUT_TOKENS = 16_000

export default defineHandler(async (event: H3Event) => {
	if (!getServerCapabilities().oracle) {
		throw createError({ statusCode: 503, message: "Análise por IA indisponível — IA não configurada neste ambiente" })
	}

	// O guard de rota do __root é client-side: não alcança esta rota Nitro. Sem a
	// checagem aqui, o endpoint seria um caminho aberto para o Bedrock da conta.
	const user = await requireSucontUser(event)

	const parsed = dgcAnalysisRequestSchema.safeParse(await readBody(event))
	if (!parsed.success) {
		throw createError({ statusCode: 400, message: "Recorte da UG inválido — reenvie as planilhas e tente novamente." })
	}
	const request = parsed.data

	// Teto de requisições ANTES de abrir o SSE: depois que o stream começa não há
	// mais status HTTP para devolver, e o erro viraria conexão cortada sem mensagem.
	try {
		enforceRequestRateLimit("SUCONT", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// `Retry-After` vai DENTRO do createError. O h3 v2 monta a resposta de erro a
			// partir de `error.headers`; um `setResponseHeader` no event é descartado nesse
			// caminho, e o cliente recebe o 429 sem saber quanto esperar.
			throw createError({
				statusCode: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	const adapter = createAdapterFromEnv("SUCONT", { rateLimitKey: user.id })

	const userPrompt = buildDgcUserPrompt({
		dataset: {
			ugCode: request.ugCode,
			ugName: request.ugName,
			group: request.group,
			rowCount: request.rowCount as Record<PanelId, number>,
			consolidated: request.consolidated,
			truncated: request.truncated,
		},
		groupContext: request.groupContext,
		competence: request.competence,
		panelsFound: request.panelsFound,
	})

	type StructuredArgs = Parameters<typeof adapter.structuredOutput>[0]
	const chatOptions = {
		messages: [{ role: "user", content: userPrompt }],
		systemPrompts: [DGC_SYSTEM_PROMPT],
		modelOptions: {
			// A análise completa (4 painéis + alertas + 20 itens de checklist) passa
			// folgado do teto padrão do Converse. Sem isto a resposta é cortada no meio
			// de uma string e o JSON não fecha — o erro que chega é "falha ao parsear",
			// que não diz nada sobre a causa.
			maxTokens: MAX_OUTPUT_TOKENS,
			// Achado contábil não pode variar entre duas execuções sobre a mesma base.
			temperature: 0,
		},
		// Obrigatório: os adapters do TanStack chamam `logger.request`/`logger.errors`
		// sem guarda. Ver `#/lib/ai-logger`.
		logger: silentAdapterLogger,
	} as unknown as StructuredArgs["chatOptions"]

	const encoder = new TextEncoder()
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false
			const send = (name: string, payload: unknown) => {
				if (closed) return
				controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`))
			}

			send("start", { ugCode: request.ugCode })

			const heartbeat = setInterval(() => {
				if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"))
			}, HEARTBEAT_MS)

			const deadline = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("A análise excedeu o tempo máximo de espera. Tente novamente.")), DEADLINE_MS)
			)

			const generation = adapter
				.structuredOutput({ chatOptions, outputSchema: dgcAnalysisSchema as unknown as StructuredArgs["outputSchema"] })
				.then((result) => normalizeDgcAnalysis(result.data, { ugCode: request.ugCode, ugName: request.ugName, competence: request.competence }))

			Promise.race([generation, deadline])
				.then((analysis) => send("done", analysis))
				.catch((error: unknown) => send("failed", { message: error instanceof Error ? error.message : "Falha ao gerar a análise." }))
				.finally(() => {
					clearInterval(heartbeat)
					closed = true
					controller.close()
				})
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
