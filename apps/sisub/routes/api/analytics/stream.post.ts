import { createError, getHeader, readBody, type H3Event } from "h3"
import { defineHandler } from "nitro"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { otelMiddleware } from "@tanstack/ai/middlewares/otel"
import { trace, metrics } from "@opentelemetry/api"
import { createAdapterFromEnv } from "@iefa/ai-provider"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "@iefa/database"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { envServer } from "@/lib/env.server"
import { ANALYTICS_SYSTEM_PROMPT } from "@/lib/analytics-prompt"
import { renderChartTool } from "@/lib/render-chart-tool"

const otel = otelMiddleware({
	tracer: trace.getTracer("sisub-analytics"),
	meter: metrics.getMeter("sisub-analytics"),
	captureContent: false,
})

function getAuthClientFromEvent(event: H3Event) {
	const cookieHeader = getHeader(event, "cookie") ?? ""
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
		throw createError({ statusCode: 503, message: "Assistente IA indisponível — não configurado neste ambiente" })
	}

	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw createError({ statusCode: 401, message: "Não autenticado" })
	}

	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch (err) {
		if (err instanceof Response) {
			throw createError({ statusCode: 400, message: "Corpo da requisição inválido" })
		}
		throw err
	}

	const { messages } = params

	const adapter = createAdapterFromEnv("ANALYTICS")
	const stream = chat({
		adapter,
		messages,
		tools: [renderChartTool],
		systemPrompts: [ANALYTICS_SYSTEM_PROMPT],
		middleware: [otel],
	})

	return toServerSentEventsResponse(stream)
})
