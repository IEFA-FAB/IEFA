import { createError, getHeader, readBody, type H3Event } from "h3"
import { defineHandler } from "nitro"
import OpenAI from "openai"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "@iefa/database"
import { envServer, getAnalyticsEnvServer } from "@/lib/env.server"
import { ANALYTICS_SYSTEM_PROMPT } from "@/lib/analytics-prompt"
import { validateSql, executeSql } from "@/lib/analytics-sql"
import type { ChartType, StreamEvent } from "@/types/domain/analytics-chat"

const CHART_SPEC_FENCE = "```chart-spec"
const CLOSING_FENCE = "```"
type ChartCellValue = string | number | boolean | null
const CHART_TYPES: ChartType[] = ["bar", "line", "area", "pie", "table"]

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

function getTrailingMarkerPrefixLength(buffer: string, marker: string) {
	const maxLength = Math.min(buffer.length, marker.length - 1)
	for (let length = maxLength; length > 0; length -= 1) {
		if (marker.startsWith(buffer.slice(-length))) {
			return length
		}
	}

	return 0
}

function normalizeChartRows(rows: Record<string, unknown>[]): Record<string, ChartCellValue>[] {
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
					return [key, value]
				}

				return [key, value == null ? null : JSON.stringify(value)]
			})
		)
	)
}

function isChartType(value: string): value is ChartType {
	return CHART_TYPES.includes(value as ChartType)
}

async function emitChartSpec(rawSpec: string, sendEvent: (data: StreamEvent) => void) {
	const parsed = JSON.parse(rawSpec) as {
		type: string
		title: string
		description?: string
		xAxisKey: string
		series: { key: string; label: string; color?: string }[]
		sql?: string
	}

	if (!parsed.sql) {
		throw new Error("Bloco chart-spec sem SQL")
	}

	if (!isChartType(parsed.type)) {
		throw new Error(`Tipo de gráfico inválido: ${parsed.type}`)
	}

	const validation = validateSql(parsed.sql)
	if (!validation.valid) {
		throw new Error(validation.error)
	}

	const rows = await executeSql(parsed.sql)

	sendEvent({
		type: "chart_spec",
		spec: {
			type: parsed.type,
			title: parsed.title,
			description: parsed.description,
			xAxisKey: parsed.xAxisKey,
			series: parsed.series,
			data: normalizeChartRows(rows),
		},
	})
}

export default defineHandler(async (event: H3Event) => {
	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw createError({ statusCode: 401, message: "Não autenticado" })
	}

	const body = await readBody<{
		message: string
		history?: { role: string; content: string }[]
		model?: string
	}>(event)

	if (!body?.message?.trim()) {
		throw createError({ statusCode: 400, message: "Mensagem vazia" })
	}

	const analyticsEnv = getAnalyticsEnvServer()

	const openai = new OpenAI({
		apiKey: analyticsEnv.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
		defaultHeaders: {
			"HTTP-Referer": "https://sisub.fly.dev",
			"X-Title": "SISUB Analytics",
		},
	})

	const encoder = new TextEncoder()
	const model = body.model?.trim() || analyticsEnv.ANALYTICS_LLM_MODEL

	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (data: StreamEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
			}

			try {
				const completion = await openai.chat.completions.create({
					model,
					stream: true,
					temperature: 0,
					messages: [
						{ role: "system", content: ANALYTICS_SYSTEM_PROMPT },
						...((body.history ?? []).filter(
							(message: { role: string; content: string }): message is { role: "user" | "assistant" | "system"; content: string } =>
								(message.role === "user" || message.role === "assistant" || message.role === "system") && typeof message.content === "string"
						)),
						{ role: "user", content: body.message },
					],
				})

				let textBuffer = ""
				let inChartSpec = false
				let chartSpecBuffer = ""

				const processBuffers = async (forceFlush = false) => {
					while (true) {
						if (!inChartSpec) {
							const markerIndex = textBuffer.indexOf(CHART_SPEC_FENCE)
							if (markerIndex === -1) {
								if (forceFlush) {
									if (textBuffer) {
										sendEvent({ type: "text_delta", delta: textBuffer })
										textBuffer = ""
									}
									return
								}

								const trailingPrefixLength = getTrailingMarkerPrefixLength(textBuffer, CHART_SPEC_FENCE)
								const safeText = textBuffer.slice(0, textBuffer.length - trailingPrefixLength)
								if (safeText) {
									sendEvent({ type: "text_delta", delta: safeText })
								}
								textBuffer = textBuffer.slice(textBuffer.length - trailingPrefixLength)
								return
							}

							const beforeBlock = textBuffer.slice(0, markerIndex)
							if (beforeBlock) {
								sendEvent({ type: "text_delta", delta: beforeBlock })
							}

							textBuffer = textBuffer.slice(markerIndex + CHART_SPEC_FENCE.length)
							if (textBuffer.startsWith("\r\n")) {
								textBuffer = textBuffer.slice(2)
							} else if (textBuffer.startsWith("\n")) {
								textBuffer = textBuffer.slice(1)
							}

							inChartSpec = true
							chartSpecBuffer = ""
							continue
						}

						chartSpecBuffer += textBuffer
						textBuffer = ""

						const closingIndex = chartSpecBuffer.indexOf(CLOSING_FENCE)
						if (closingIndex === -1) {
							if (forceFlush && chartSpecBuffer.trim()) {
								sendEvent({
									type: "error",
									message: "Resposta da IA terminou com um bloco de gráfico incompleto.",
								})
							}
							return
						}

						const rawSpec = chartSpecBuffer.slice(0, closingIndex).trim()
						const remainder = chartSpecBuffer.slice(closingIndex + CLOSING_FENCE.length)
						inChartSpec = false
						chartSpecBuffer = ""

						try {
							await emitChartSpec(rawSpec, sendEvent)
						} catch (e) {
							sendEvent({
								type: "error",
								message: `Erro ao gerar gráfico: ${(e as Error).message}`,
							})
						}

						textBuffer = remainder
					}
				}

				for await (const chunk of completion) {
					const delta = chunk.choices[0]?.delta?.content ?? ""
					if (!delta) {
						continue
					}

					textBuffer += delta
					await processBuffers()
				}

				await processBuffers(true)
				sendEvent({ type: "done" })
			} catch (e) {
				sendEvent({ type: "error", message: (e as Error).message })
			} finally {
				controller.close()
			}
		},
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	})
})
