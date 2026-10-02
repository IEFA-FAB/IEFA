import { createAdapterFromEnv, defaultRateLimitStore, enforceRequestRateLimit, maxIterationsMiddleware, RateLimitError } from "@iefa/ai-provider"
import { checkSameOriginJsonRequest } from "@iefa/auth-kit"
import type { Database } from "@iefa/database"
import { resolveUserPermissions } from "@iefa/pbac"
import { metrics, trace } from "@opentelemetry/api"
import { createServerClient } from "@supabase/ssr"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { otelMiddleware } from "@tanstack/ai/middlewares/otel"
import { type H3Event, HTTPError, readBody } from "h3"
import { defineHandler } from "nitro"
import { AI_CHAT_MAX_ITERATIONS, canUseAnalyticsAssistant, SISUB_AI_RATE_LIMIT_DEFAULTS } from "@/lib/ai-chat-limits"
import { ANALYTICS_SYSTEM_PROMPT } from "@/lib/analytics-prompt"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { checkChatPayloadSize, sanitizeClientMessages } from "@/lib/chat-client-messages"
import { envServer } from "@/lib/env.server"
import { renderChartTool } from "@/lib/render-chart-tool"
import { getAccessControlClient } from "@/lib/supabase.server"

const otel = otelMiddleware({
	tracer: trace.getTracer("sisub-analytics"),
	meter: metrics.getMeter("sisub-analytics"),
	captureContent: false,
})

function getAuthClientFromEvent(event: H3Event) {
	const cookieHeader = event.req.headers.get("cookie") ?? ""
	const parsedCookies = cookieHeader.split(";").map((c: string) => {
		const [name, ...v] = c.split("=")
		return { name: name.trim(), value: v.join("=") }
	})
	return createServerClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		cookies: {
			getAll: () => parsedCookies,
			setAll: () => {},
		},
	})
}

export default defineHandler(async (event: H3Event) => {
	// Capability gate — sem secrets ANALYTICS_AI_* o assistente fica "Em breve"
	// na UI e o endpoint responde 503, sem quebrar o deploy.
	if (!getServerCapabilities().analyticsChat) {
		throw new HTTPError({ status: 503, message: "Assistente IA indisponível — não configurado neste ambiente" })
	}

	// CSRF: o corpo é lido com a sessão do cookie, e `readBody` aceita `text/plain`.
	const origin = checkSameOriginJsonRequest(event.req.headers, event.req.url)
	if (!origin.ok) {
		throw new HTTPError({ status: 403, message: origin.reason })
	}

	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw new HTTPError({ status: 401, message: "Não autenticado" })
	}

	// `analytics:1` SEM escopo: o `render_chart` roda SQL com BYPASSRLS sobre todas as OMs, e um
	// grant escopado não recortaria nada do que ele lê (ver `canUseAnalyticsAssistant`).
	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	if (!canUseAnalyticsAssistant(permissions)) {
		throw new HTTPError({ status: 403, message: "Permissão insuficiente" })
	}

	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch (err) {
		if (err instanceof Response) {
			throw new HTTPError({ status: 400, message: "Corpo da requisição inválido" })
		}
		throw err
	}

	const sizeError = checkChatPayloadSize(params.messages)
	if (sizeError) {
		throw new HTTPError({ status: 413, message: sizeError })
	}
	// Sem aprovação humana neste fluxo: toda tool call pendente vinda do cliente é forjada.
	const messages = sanitizeClientMessages(params.messages, { allowPendingToolCalls: false })

	// Teto de consumo antes de abrir o SSE — ver comentário equivalente no chat dos módulos.
	try {
		enforceRequestRateLimit("ANALYTICS", user.id, defaultRateLimitStore, SISUB_AI_RATE_LIMIT_DEFAULTS)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// `Retry-After` vai DENTRO do erro. O h3 v2 monta a resposta de erro a partir de
			// `error.headers`; um header setado no event é descartado nesse caminho, e o
			// cliente recebe o 429 sem saber quanto esperar.
			throw new HTTPError({
				status: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	const adapter = createAdapterFromEnv("ANALYTICS", { rateLimitKey: user.id, rateLimitDefaults: SISUB_AI_RATE_LIMIT_DEFAULTS })
	const stream = chat({
		adapter,
		messages,
		tools: [renderChartTool],
		systemPrompts: [ANALYTICS_SYSTEM_PROMPT],
		// Mesmo teto do chat dos módulos: SQL recusado faz o modelo tentar de novo, e cada
		// tentativa reenvia o histórico inteiro (com os resultados das anteriores).
		middleware: [otel, maxIterationsMiddleware(AI_CHAT_MAX_ITERATIONS)],
	})

	return toServerSentEventsResponse(stream)
})
