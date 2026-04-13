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
const CHART_SPEC_REGEX = /```\s*chart[-_]?spec/i
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

/**
 * Robustly extract a JSON object from the raw chart-spec block content.
 *
 * LLMs sometimes wrap the JSON with extra content:
 *   - Nested ```json fences
 *   - Explanatory text before/after the JSON
 *   - Trailing commas (stripped here)
 *
 * Returns the cleaned JSON string ready for `JSON.parse`.
 */
function extractJsonFromSpec(raw: string): string {
	let cleaned = raw.trim()

	// Strip nested ```json / ``` markers some LLMs add inside chart-spec
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()

	// Locate the outermost { … } boundaries
	const firstBrace = cleaned.indexOf("{")
	const lastBrace = cleaned.lastIndexOf("}")

	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		throw new SyntaxError(
			`Nenhum objeto JSON encontrado no bloco chart-spec. Início do conteúdo: "${raw.slice(0, 120)}"`
		)
	}

	let json = cleaned.slice(firstBrace, lastBrace + 1)

	// Strip trailing commas before } or ] (common LLM mistake, invalid JSON)
	json = json.replace(/,\s*([\]}])/g, "$1")

	// Escape raw control characters inside JSON string values.
	// LLMs sometimes emit literal newlines/tabs inside strings which are
	// invalid JSON and cause "Unterminated string" errors in JSON.parse.
	json = json.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_match, content: string) => {
		const fixed = content
			.replace(/\r\n/g, "\\n")
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t")
		return `"${fixed}"`
	})

	return json
}

async function emitChartSpec(rawSpec: string, sendEvent: (data: StreamEvent) => void) {
	const jsonStr = extractJsonFromSpec(rawSpec)
	const parsed = JSON.parse(jsonStr) as {
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
	const data = normalizeChartRows(rows)

	// Validate that chart keys actually exist in the SQL result columns.
	// Catches mismatches (e.g. xAxisKey: "mes" but SQL returns "mês")
	// before sending to the client, where Recharts would silently render empty.
	if (data.length > 0) {
		const availableKeys = Object.keys(data[0]!)

		if (!availableKeys.includes(parsed.xAxisKey)) {
			throw new Error(
				`Chave do eixo X "${parsed.xAxisKey}" não existe nos resultados SQL. ` +
					`Colunas disponíveis: ${availableKeys.join(", ")}`
			)
		}

		for (const s of parsed.series) {
			if (!availableKeys.includes(s.key)) {
				throw new Error(
					`Chave de série "${s.key}" não existe nos resultados SQL. ` +
						`Colunas disponíveis: ${availableKeys.join(", ")}`
				)
			}
		}
	}

	sendEvent({
		type: "chart_spec",
		spec: {
			type: parsed.type,
			title: parsed.title,
			description: parsed.description,
			xAxisKey: parsed.xAxisKey,
			series: parsed.series,
			data,
			// sql persisted for replay/refresh; never rendered in the UI
			sql: parsed.sql,
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
							// Regex tolerates whitespace/case variations from the LLM
							// e.g. "``` chart-spec", "```Chart-Spec", "```chart_spec"
							const markerMatch = CHART_SPEC_REGEX.exec(textBuffer)
							if (!markerMatch) {
								if (forceFlush) {
									if (textBuffer) {
										sendEvent({ type: "text_delta", delta: textBuffer })
										textBuffer = ""
									}
									return
								}

								// Canonical fence for trailing-prefix detection (all variants start with ```)
								const trailingPrefixLength = getTrailingMarkerPrefixLength(textBuffer, CHART_SPEC_FENCE)
								const safeText = textBuffer.slice(0, textBuffer.length - trailingPrefixLength)
								if (safeText) {
									sendEvent({ type: "text_delta", delta: safeText })
								}
								textBuffer = textBuffer.slice(textBuffer.length - trailingPrefixLength)
								return
							}

							const beforeBlock = textBuffer.slice(0, markerMatch.index)
							if (beforeBlock) {
								sendEvent({ type: "text_delta", delta: beforeBlock })
							}

							textBuffer = textBuffer.slice(markerMatch.index + markerMatch[0].length)
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
							const err = e as Error
							console.error("[analytics/stream] chart-spec error:", err.message, "\nrawSpec:", rawSpec.slice(0, 300))
							sendEvent({
								type: "error",
								message:
									err instanceof SyntaxError
										? `Erro ao interpretar gráfico: ${err.message}`
										: `Erro ao gerar gráfico: ${err.message}`,
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
