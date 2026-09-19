/**
 * Conversa que redige a comunicação oficial (NSCA 5-3/2026).
 *
 * O documento em edição vem do CLIENTE a cada turno e volta pelo cliente: as tools
 * validam e devolvem o remendo, mas não gravam nada. É o que mantém o formulário
 * editável durante a conversa — servidor mutando a linha do banco criaria duas fontes de
 * verdade para o mesmo documento, e o turno seguinte sobrescreveria o que o usuário
 * digitou à mão.
 *
 * A ordem das guardas é a mesma dos demais consumidores de IA do monorepo, e cada uma
 * existe por um motivo já pago em produção:
 *   1. capability gate → 503 quando `PORTAL_AI_*` não está configurado;
 *   2. mesma origem + JSON → o cookie é `SameSite=Lax` e `*.iefa.com.br` é "same-site":
 *      sem isto, uma página em outro subdomínio disparava o chat com a sessão da vítima;
 *   3. sessão → o `beforeLoad` da rota é client-side e não alcança este endpoint;
 *   4. tamanho → histórico sem teto vira custo de token pago por turno (e 413 do provider);
 *   5. sigilo → documento classificado não vai a provider nenhum;
 *   6. teto de consumo ANTES do stream → depois do SSE aberto não há mais status HTTP.
 */

import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { checkSameOriginJsonRequest } from "@iefa/auth-kit"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { defineHandler } from "nitro"
import { type H3Event, HTTPError, readBody } from "nitro/h3"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { assembleDocument } from "@/lib/comaer/assemble"
import { resolveKind } from "@/lib/comaer/catalog"
import { buildChatSystemPrompt, describeDocument } from "@/lib/comaer/prompt"
import { DocumentPayloadSchema, fromPayload } from "@/lib/comaer/schema"
import { buildChatTools } from "@/lib/comaer/tools/server"
import { requirePortalUser } from "@/lib/nitro-auth.server"

/**
 * Tetos do corpo. O histórico legítimo é o do `chat-history.fn.ts` (até 200 mensagens
 * recarregadas) mais o turno corrente com as tool calls; o documento vai inteiro em
 * `forwardedProps`. Acima disso o provider já recusaria o contexto — aqui a recusa sai com
 * mensagem, antes de ler/parsear megabytes e antes de gastar a cota de ninguém.
 */
const MAX_BODY_BYTES = 2_000_000
const MAX_MESSAGES = 400
const MAX_MESSAGES_CHARS = 1_000_000

export default defineHandler(async (event: H3Event) => {
	if (!getServerCapabilities().documentAi) {
		throw new HTTPError({ status: 503, message: "Redação assistida indisponível — não configurada neste ambiente." })
	}

	// Antes da sessão: a checagem não depende de quem chama, e um POST cross-site não
	// deve nem chegar a validar o cookie.
	const origin = checkSameOriginJsonRequest(event.req.headers, event.req.url)
	if (!origin.ok) throw new HTTPError({ status: 403, message: `Requisição recusada: ${origin.reason}.` })

	const user = await requirePortalUser(event)

	const declaredLength = Number(event.req.headers.get("content-length") ?? 0)
	if (declaredLength > MAX_BODY_BYTES) throw new HTTPError({ status: 413, message: "Conversa grande demais para um turno. Inicie uma nova conversa." })

	const rawBody = await readBody(event)
	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch (err) {
		if (err instanceof Response) throw new HTTPError({ status: 400, message: "Corpo da requisição inválido (formato AG-UI esperado)." })
		throw err
	}

	const { messages, forwardedProps } = params

	// `content-length` pode faltar (chunked): o teto que vale é o do conteúdo já parseado.
	if (messages.length > MAX_MESSAGES || JSON.stringify(messages).length > MAX_MESSAGES_CHARS) {
		throw new HTTPError({ status: 413, message: "Conversa grande demais para um turno. Inicie uma nova conversa." })
	}

	// O documento é validado como qualquer outro dado que entra: ele vem do cliente.
	const parsed = DocumentPayloadSchema.safeParse(forwardedProps.document)
	if (!parsed.success) throw new HTTPError({ status: 400, message: "Documento inválido no corpo da requisição." })
	const document = fromPayload(parsed.data)

	if (document.classification !== "ostensivo") {
		throw new HTTPError({
			status: 422,
			message: "Documento classificado não é enviado a provider de IA. Redija o texto manualmente (art. 7º § 2º e normas de salvaguarda).",
		})
	}

	// Teto ANTES de abrir o SSE. Depois do primeiro byte o 429 vira conexão cortada, e o
	// `Retry-After` precisa nascer dentro do HTTPError: o h3 v2 monta a resposta de erro a
	// partir de `error.headers`, e um `setResponseHeader` no event é descartado nesse caminho.
	try {
		enforceRequestRateLimit("PORTAL", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			throw new HTTPError({
				status: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	// A espécie passa pela mesma queda que a folha e a biblioteca já fazem: `assembleDocument`
	// LANÇA para espécie fora do catálogo, e um documento gravado assim renderizava normal na
	// tela e derrubava toda mensagem enviada, com 500 e sem explicação.
	const assembled = assembleDocument({ ...document, kind: resolveKind(document.kind).id })
	const adapter = createAdapterFromEnv("PORTAL", { rateLimitKey: user.id })

	const stream = chat({
		adapter,
		messages,
		tools: buildChatTools(document),
		systemPrompts: [buildChatSystemPrompt(assembled), describeDocument(assembled)],
	})

	return toServerSentEventsResponse(stream)
})
