import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import type { Database } from "@iefa/database"
import { metrics, trace } from "@opentelemetry/api"
import { createServerClient } from "@supabase/ssr"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { otelMiddleware } from "@tanstack/ai/middlewares/otel"
import { type H3Event, HTTPError, readBody } from "h3"
import { defineHandler } from "nitro"
import { ANALYTICS_SYSTEM_PROMPT } from "@/lib/analytics-prompt"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { envServer } from "@/lib/env.server"
import { renderChartTool } from "@/lib/render-chart-tool"

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

	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw new HTTPError({ status: 401, message: "Não autenticado" })
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

	const { messages } = params

	// Teto de consumo antes de abrir o SSE — ver comentário equivalente no chat dos módulos.
	try {
		enforceRequestRateLimit("ANALYTICS", user.id)
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

	const adapter = createAdapterFromEnv("ANALYTICS", { rateLimitKey: user.id })
	const stream = chat({
		adapter,
		messages,
		tools: [renderChartTool],
		systemPrompts: [ANALYTICS_SYSTEM_PROMPT],
		middleware: [otel],
	})

	return toServerSentEventsResponse(stream)
})
