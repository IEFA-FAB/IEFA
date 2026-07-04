import {
	type Message as BedrockMessage,
	BedrockRuntimeClient,
	type Tool as BedrockTool,
	type ContentBlock,
	ConverseCommand,
	ConverseStreamCommand,
	type ConverseStreamOutput,
	type StopReason,
	type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime"
import type { AnyTextAdapter, StreamChunk, TextOptions } from "@tanstack/ai"

/**
 * Adapter AWS Bedrock — genérico via Converse API (`ConverseStream`).
 *
 * Model-agnostic: serve qualquer modelo Bedrock (Anthropic Claude, Meta Llama,
 * etc.) — o modelo é escolhido só pelo `model` (id do modelo ou do inference
 * profile). Autenticação via cadeia de credenciais padrão da AWS (task role do
 * ECS Fargate em prod; profile local em dev) — sem API key.
 *
 * Implementa a interface `TextAdapter` do @tanstack/ai como objeto plano
 * (mesmo padrão dos demais wrappers deste pacote): traduz o stream do Bedrock
 * para os eventos AG-UI que o engine `chat()` consome.
 */

// ── ID helper ─────────────────────────────────────────────────────────────────
// Sem Math.random/crypto: contador monotônico por processo é suficiente para
// correlacionar eventos de um mesmo run no stream AG-UI.
let idCounter = 0
function generateId(prefix: string): string {
	idCounter += 1
	return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

// Cast de um objeto de evento para StreamChunk. Os adapters do @tanstack/ai
// constroem eventos com tipos literais string, estruturalmente compatíveis com
// o enum EventType do AG-UI.
const asChunk = (chunk: Record<string, unknown>): StreamChunk => chunk as unknown as StreamChunk

// ── Conversão de mensagens (ModelMessage → Bedrock Converse) ──────────────────

function contentBlocksFromMessage(msg: TextOptions["messages"][number]): ContentBlock[] {
	// Resultado de tool → bloco toolResult (Bedrock exige que resultados de tool
	// venham numa mensagem de role "user").
	if (msg.role === "tool") {
		const resultText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
		return [
			{
				toolResult: {
					toolUseId: msg.toolCallId ?? "",
					content: [{ text: resultText || " " }],
					status: "success",
				},
			},
		]
	}

	const blocks: ContentBlock[] = []

	if (Array.isArray(msg.content)) {
		for (const part of msg.content) {
			if (part.type === "text" && part.content) {
				blocks.push({ text: part.content })
			} else if (part.type === "image" && part.source.type === "data") {
				const format = (part.source.mimeType.split("/")[1] ?? "png") as "png" | "jpeg" | "gif" | "webp"
				blocks.push({
					image: { format, source: { bytes: Buffer.from(part.source.value, "base64") } },
				})
			}
		}
	} else if (typeof msg.content === "string" && msg.content) {
		blocks.push({ text: msg.content })
	}

	// Tool calls do assistant → blocos toolUse.
	if (msg.role === "assistant" && msg.toolCalls?.length) {
		for (const tc of msg.toolCalls) {
			let input: unknown = {}
			try {
				input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
			} catch {
				input = {}
			}
			// `input` é um smithy DocumentType — cast pontual (ver toBedrockTools).
			blocks.push({ toolUse: { toolUseId: tc.id, name: tc.function.name, input } } as unknown as ContentBlock)
		}
	}

	// Bedrock rejeita mensagens com content vazio.
	if (blocks.length === 0) blocks.push({ text: " " })
	return blocks
}

function toBedrockMessages(messages: TextOptions["messages"]): BedrockMessage[] {
	const out: BedrockMessage[] = []
	for (const msg of messages) {
		const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user"
		const blocks = contentBlocksFromMessage(msg)
		const prev = out[out.length - 1]
		// Coalesce turnos consecutivos de mesmo role (ex.: vários toolResult viram
		// um único turno "user") — Converse exige alternância user/assistant.
		if (prev && prev.role === role && prev.content) {
			prev.content.push(...blocks)
		} else {
			out.push({ role, content: blocks })
		}
	}
	return out
}

function toBedrockTools(tools: TextOptions["tools"]): ToolConfiguration | undefined {
	if (!tools || tools.length === 0) return undefined
	const specs = tools.map((tool) => ({
		toolSpec: {
			name: tool.name,
			description: tool.description,
			// `json` é um smithy DocumentType; um JSON Schema é um documento válido
			// em runtime, mas o TS não consegue provar — cast pontual.
			inputSchema: { json: tool.inputSchema ?? { type: "object", properties: {} } },
		},
	}))
	return { tools: specs as unknown as BedrockTool[] }
}

function systemFromPrompts(systemPrompts: TextOptions["systemPrompts"]): { text: string }[] | undefined {
	if (!systemPrompts?.length) return undefined
	const text = systemPrompts
		.map((p) => (typeof p === "string" ? p : (p.content ?? "")))
		.filter(Boolean)
		.join("\n\n")
	return text ? [{ text }] : undefined
}

function buildConverseInput(model: string, options: TextOptions) {
	// Parâmetros de inferência vêm de modelOptions (provider options do @tanstack/ai).
	const mo = (options.modelOptions ?? {}) as { maxTokens?: number; temperature?: number; topP?: number }
	const inferenceConfig: Record<string, number> = {}
	if (typeof mo.maxTokens === "number") inferenceConfig.maxTokens = mo.maxTokens
	if (typeof mo.temperature === "number") inferenceConfig.temperature = mo.temperature
	if (typeof mo.topP === "number") inferenceConfig.topP = mo.topP

	return {
		modelId: model,
		messages: toBedrockMessages(options.messages),
		system: systemFromPrompts(options.systemPrompts),
		toolConfig: toBedrockTools(options.tools),
		inferenceConfig: Object.keys(inferenceConfig).length ? inferenceConfig : undefined,
	}
}

function mapFinishReason(stopReason: StopReason | undefined, hadToolCalls: boolean): string {
	if (stopReason === "tool_use" || hadToolCalls) return "tool_calls"
	if (stopReason === "max_tokens") return "length"
	return "stop"
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export function createBedrockChat(model: string, region?: string, client?: BedrockRuntimeClient): AnyTextAdapter {
	const bedrock = client ?? new BedrockRuntimeClient(region ? { region } : {})

	async function* chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
		// logger é obrigatório no TextOptions, mas guardamos por robustez (chamadas diretas em teste).
		const logger = options.logger
		const timestamp = Date.now()
		const runId = options.runId ?? generateId("run")
		const threadId = options.threadId ?? generateId("thread")
		const messageId = generateId("msg")

		let hasRunStarted = false
		let textStarted = false
		let accumulatedText = ""
		let hadToolCalls = false
		let stopReason: StopReason | undefined
		let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
		// Blocos de tool em aberto, indexados por contentBlockIndex.
		const toolBlocks = new Map<number, { toolCallId: string; name: string; args: string }>()

		try {
			logger?.request?.(`activity=chat provider=bedrock model=${model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`, {
				provider: "bedrock",
				model,
			})

			const response = await bedrock.send(new ConverseStreamCommand(buildConverseInput(model, options)), {
				abortSignal: options.abortController?.signal,
			})

			for await (const ev of (response.stream ?? []) as AsyncIterable<ConverseStreamOutput>) {
				logger?.provider?.("provider=bedrock", { chunk: ev })

				if (!hasRunStarted) {
					hasRunStarted = true
					yield asChunk({ type: "RUN_STARTED", runId, threadId, model, timestamp })
				}

				// Início de um bloco toolUse.
				const startTool = ev.contentBlockStart?.start?.toolUse
				if (startTool && ev.contentBlockStart) {
					const index = ev.contentBlockStart.contentBlockIndex ?? 0
					const toolCallId = startTool.toolUseId ?? generateId("tool")
					toolBlocks.set(index, { toolCallId, name: startTool.name ?? "", args: "" })
					hadToolCalls = true
					yield asChunk({
						type: "TOOL_CALL_START",
						toolCallId,
						toolCallName: startTool.name ?? "",
						toolName: startTool.name ?? "",
						model,
						timestamp,
						index,
					})
					continue
				}

				// Deltas de conteúdo (texto ou input incremental de tool).
				const delta = ev.contentBlockDelta?.delta
				if (delta) {
					const index = ev.contentBlockDelta?.contentBlockIndex ?? 0
					if (typeof delta.text === "string" && delta.text) {
						if (!textStarted) {
							textStarted = true
							yield asChunk({ type: "TEXT_MESSAGE_START", messageId, model, timestamp, role: "assistant" })
						}
						accumulatedText += delta.text
						yield asChunk({
							type: "TEXT_MESSAGE_CONTENT",
							messageId,
							model,
							timestamp,
							delta: delta.text,
							content: accumulatedText,
						})
					} else if (delta.toolUse?.input != null) {
						const block = toolBlocks.get(index)
						if (block) {
							block.args += delta.toolUse.input
							yield asChunk({
								type: "TOOL_CALL_ARGS",
								toolCallId: block.toolCallId,
								model,
								timestamp,
								delta: delta.toolUse.input,
								args: block.args,
							})
						}
					}
					continue
				}

				// Fim de um bloco: se for tool, fecha com o input acumulado.
				if (ev.contentBlockStop) {
					const index = ev.contentBlockStop.contentBlockIndex ?? 0
					const block = toolBlocks.get(index)
					if (block) {
						let parsedInput: unknown = {}
						try {
							parsedInput = block.args ? JSON.parse(block.args) : {}
						} catch {
							parsedInput = {}
						}
						yield asChunk({
							type: "TOOL_CALL_END",
							toolCallId: block.toolCallId,
							toolCallName: block.name,
							toolName: block.name,
							model,
							timestamp,
							input: parsedInput,
						})
						toolBlocks.delete(index)
					}
					continue
				}

				if (ev.messageStop) {
					stopReason = ev.messageStop.stopReason
				}

				if (ev.metadata?.usage) {
					const u = ev.metadata.usage
					usage = {
						promptTokens: u.inputTokens ?? 0,
						completionTokens: u.outputTokens ?? 0,
						totalTokens: u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
					}
				}
			}

			if (textStarted) {
				yield asChunk({ type: "TEXT_MESSAGE_END", messageId, model, timestamp })
			}

			yield asChunk({
				type: "RUN_FINISHED",
				runId,
				threadId,
				model,
				timestamp,
				finishReason: mapFinishReason(stopReason, hadToolCalls),
				usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
			})
		} catch (error) {
			logger?.errors?.("bedrock.chatStream fatal", { error, source: "bedrock.chatStream" })
			throw error
		}
	}

	async function structuredOutput(options: {
		chatOptions: TextOptions
		outputSchema: unknown
	}): Promise<{ data: unknown; rawText: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
		const { chatOptions } = options
		const response = await bedrock.send(new ConverseCommand(buildConverseInput(model, chatOptions)), {
			abortSignal: chatOptions.abortController?.signal,
		})

		const rawText = (response.output?.message?.content ?? []).map((b) => ("text" in b && b.text ? b.text : "")).join("")

		let data: unknown
		try {
			data = JSON.parse(rawText)
		} catch {
			throw new Error(`Falha ao parsear saída estruturada como JSON. Conteúdo: ${rawText.slice(0, 200)}`)
		}

		return {
			data,
			rawText,
			usage: response.usage
				? {
						promptTokens: response.usage.inputTokens ?? 0,
						completionTokens: response.usage.outputTokens ?? 0,
						totalTokens: response.usage.totalTokens ?? 0,
					}
				: undefined,
		}
	}

	return {
		kind: "text",
		name: "bedrock",
		model,
		chatStream,
		structuredOutput,
	} as unknown as AnyTextAdapter
}

export function createBedrockAdapter(model: string, region?: string): AnyTextAdapter {
	return createBedrockChat(model, region)
}
