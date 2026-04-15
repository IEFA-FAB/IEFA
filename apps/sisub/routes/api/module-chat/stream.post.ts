/**
 * Module Chat SSE streaming endpoint.
 * Agentic loop with OpenAI function calling — executes tools server-side.
 *
 * Flow:
 * 1. Auth (cookie → getUser)
 * 2. PBAC check (module + scope)
 * 3. Load module config (prompt + tools filtered by user level)
 * 4. Agentic loop: stream LLM → tool calls → execute → feed back → repeat (max 8 rounds)
 * 5. SSE events: text_delta, tool_call_start, tool_call_done, tool_result, done, error
 */

import { createError, getHeader, readBody, type H3Event } from "h3"
import { defineHandler } from "nitro"
import OpenAI from "openai"
import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { hasPermission } from "@/auth/pbac"
import { envServer, getAnalyticsEnvServer } from "@/lib/env.server"
import { findToolHandler, getModuleConfig } from "@/lib/module-chat/tools/registry"
import { type ToolContext, ToolPermissionError, ToolValidationError, getMaxLevel, toOpenAITools } from "@/lib/module-chat/tools/shared"
import type { ChatModule, ModuleStreamEvent } from "@/types/domain/module-chat"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

const MAX_TOOL_ROUNDS = 8
const CHAT_MODULES: ChatModule[] = ["global", "kitchen", "unit"]

// ── Auth helpers ────────────────────────────────────────────────────────────

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

function getDataClient() {
	return createClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

async function loadUserPermissions(supabase: ReturnType<typeof getDataClient>, userId: string): Promise<UserPermission[]> {
	// biome-ignore lint/suspicious/noExplicitAny: user_permissions may not be in sisub schema types
	const { data, error } = await (supabase as any).from("user_permissions").select("module, level, mess_hall_id, kitchen_id, unit_id").eq("user_id", userId)

	if (error) throw new Error("Erro ao carregar permissões")
	return ((data as unknown[]) ?? []).filter((p: any) => p.level > 0) as UserPermission[]
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default defineHandler(async (event: H3Event) => {
	// 1. Auth
	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw createError({ statusCode: 401, message: "Não autenticado" })
	}

	// 2. Parse body
	const body = await readBody<{
		message: string
		module: string
		scopeId?: number
		history?: Array<{ role: string; content: string; tool_calls?: unknown }>
	}>(event)

	if (!body?.message?.trim()) {
		throw createError({ statusCode: 400, message: "Mensagem vazia" })
	}

	const module = body.module as ChatModule
	if (!CHAT_MODULES.includes(module)) {
		throw createError({ statusCode: 400, message: "Módulo inválido" })
	}

	// 3. PBAC check
	const supabase = getDataClient()
	const permissions = await loadUserPermissions(supabase, user.id)

	const appModule: AppModule = module
	const scope: PermissionScope | undefined =
		module === "kitchen" && body.scopeId
			? { type: "kitchen", id: body.scopeId }
			: module === "unit" && body.scopeId
				? { type: "unit", id: body.scopeId }
				: undefined

	if (!hasPermission(permissions, appModule, 1, scope)) {
		throw createError({ statusCode: 403, message: "Permissão insuficiente" })
	}

	const userLevel = getMaxLevel(permissions, appModule, body.scopeId)

	// 4. Load module config
	const { systemPrompt, tools } = getModuleConfig(module, userLevel)

	const toolCtx: ToolContext = {
		userId: user.id,
		permissions,
		module,
		scopeId: body.scopeId,
		supabase,
	}

	// 5. Build OpenAI client
	const analyticsEnv = getAnalyticsEnvServer()
	const openai = new OpenAI({
		apiKey: analyticsEnv.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
		defaultHeaders: {
			"HTTP-Referer": "https://sisub.fly.dev",
			"X-Title": "SISUB Module Chat",
		},
	})

	const llmModel = process.env.MODULE_CHAT_LLM_MODEL || analyticsEnv.ANALYTICS_LLM_MODEL
	const openaiTools = tools.length > 0 ? toOpenAITools(tools) : undefined

	// Build message history
	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		...(body.history ?? [])
			.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
			.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
		{ role: "user", content: body.message },
	]

	// 6. SSE stream
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (data: ModuleStreamEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
			}

			// Heartbeat to keep connection alive during tool execution
			const heartbeatInterval = setInterval(() => {
				controller.enqueue(encoder.encode(": heartbeat\n\n"))
			}, 15_000)

			try {
				let round = 0

				while (round < MAX_TOOL_ROUNDS) {
					round++

					const completion = await openai.chat.completions.create({
						model: llmModel,
						stream: true,
						temperature: 0.3,
						messages,
						...(openaiTools ? { tools: openaiTools } : {}),
					})

					let textBuffer = ""
					const pendingToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()
					let finishReason: string | null = null

					for await (const chunk of completion) {
						const choice = chunk.choices[0]
						if (!choice) continue

						// Text content
						const textDelta = choice.delta?.content
						if (textDelta) {
							textBuffer += textDelta
							sendEvent({ type: "text_delta", delta: textDelta })
						}

						// Tool calls (accumulated across chunks)
						if (choice.delta?.tool_calls) {
							for (const tc of choice.delta.tool_calls) {
								const idx = tc.index
								if (!pendingToolCalls.has(idx)) {
									pendingToolCalls.set(idx, {
										id: tc.id ?? `call_${idx}`,
										name: tc.function?.name ?? "",
										arguments: "",
									})
									if (tc.function?.name) {
										sendEvent({ type: "tool_call_start", id: tc.id ?? `call_${idx}`, name: tc.function.name })
									}
								}
								const existing = pendingToolCalls.get(idx)!
								if (tc.id && !existing.id.startsWith("call_")) existing.id = tc.id
								if (tc.function?.name && !existing.name) existing.name = tc.function.name
								if (tc.function?.arguments) {
									existing.arguments += tc.function.arguments
								}
							}
						}

						if (choice.finish_reason) {
							finishReason = choice.finish_reason
						}
					}

					// If no tool calls, we're done
					if (finishReason !== "tool_calls" || pendingToolCalls.size === 0) {
						break
					}

					// Execute tool calls
					const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
						role: "assistant",
						content: textBuffer || null,
						tool_calls: Array.from(pendingToolCalls.values()).map((tc) => ({
							id: tc.id,
							type: "function" as const,
							function: { name: tc.name, arguments: tc.arguments },
						})),
					}
					messages.push(assistantMessage)

					for (const tc of pendingToolCalls.values()) {
						let parsedArgs: Record<string, unknown> = {}
						try {
							parsedArgs = JSON.parse(tc.arguments || "{}")
						} catch {
							// malformed arguments
						}

						sendEvent({
							type: "tool_call_done",
							id: tc.id,
							name: tc.name,
							arguments: parsedArgs,
						})

						// Execute the tool
						let resultContent: string
						let isError = false

						try {
							const toolDef = findToolHandler(module, tc.name)
							if (!toolDef) {
								resultContent = JSON.stringify({ error: `Tool "${tc.name}" não encontrada` })
								isError = true
							} else {
								const result = await toolDef.handler(parsedArgs, toolCtx)
								if (result.success) {
									resultContent = JSON.stringify(result.data)
								} else {
									resultContent = JSON.stringify({ error: result.error })
									isError = true
								}
							}
						} catch (e) {
							if (e instanceof ToolPermissionError) {
								resultContent = JSON.stringify({ error: e.message })
							} else if (e instanceof ToolValidationError) {
								resultContent = JSON.stringify({ error: e.message })
							} else {
								resultContent = JSON.stringify({ error: "Erro interno ao executar ferramenta" })
								console.error(`[module-chat:tool:${tc.name}]`, e)
							}
							isError = true
						}

						sendEvent({
							type: "tool_result",
							id: tc.id,
							name: tc.name,
							result: JSON.parse(resultContent),
							isError,
						})

						// Add tool result to messages for next LLM round
						messages.push({
							role: "tool",
							tool_call_id: tc.id,
							content: resultContent,
						} as OpenAI.Chat.Completions.ChatCompletionMessageParam)
					}

					// Continue loop — LLM will process tool results in next round
				}

				sendEvent({ type: "done" })
			} catch (e) {
				sendEvent({ type: "error", message: (e as Error).message })
			} finally {
				clearInterval(heartbeatInterval)
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
