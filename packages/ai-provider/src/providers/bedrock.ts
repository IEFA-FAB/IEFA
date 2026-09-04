import type {
	Message as BedrockMessage,
	BedrockRuntimeClient,
	Tool as BedrockTool,
	ContentBlock,
	ConverseStreamOutput,
	StopReason,
	ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime"
import type { AnyTextAdapter, StreamChunk, TextOptions } from "@tanstack/ai"

// Import dinâmico do AWS SDK: só carrega a árvore de deps do Bedrock quando um
// adapter bedrock é efetivamente usado. Assim `import "@iefa/ai-provider"` não
// puxa o SDK para consumidores que usam outro provider. Os imports acima são
// só de tipo (apagados na compilação) e não disparam o require em runtime.
type BedrockSdk = typeof import("@aws-sdk/client-bedrock-runtime")
let sdkPromise: Promise<BedrockSdk> | undefined
function loadSdk(): Promise<BedrockSdk> {
	if (!sdkPromise) sdkPromise = import("@aws-sdk/client-bedrock-runtime")
	return sdkPromise
}

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

/**
 * Limites do serviço (Converse): até 20 imagens de 3,75 MB e 5 documentos de 4,5 MB por
 * mensagem, e só em mensagem de papel `user`. Validar aqui devolve um erro que diz o que
 * violou; deixar passar devolve um ValidationException genérico do provider.
 */
const MAX_IMAGES_PER_MESSAGE = 20
const MAX_DOCUMENTS_PER_MESSAGE = 5
const MAX_DOCUMENT_BYTES = 4.5 * 1024 * 1024

/** Formatos que o Converse aceita como documento, pelo MIME de origem. */
const DOCUMENT_FORMAT_BY_MIME: Record<string, string> = {
	"application/pdf": "pdf",
	"application/msword": "doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	"application/vnd.ms-excel": "xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
	"text/csv": "csv",
	"text/html": "html",
	"text/markdown": "md",
	"text/plain": "txt",
}

function documentBlock(mimeType: string, base64: string, index: number): ContentBlock {
	if (index > MAX_DOCUMENTS_PER_MESSAGE) throw new Error(`Bedrock aceita no máximo ${MAX_DOCUMENTS_PER_MESSAGE} documentos por mensagem.`)

	const format = DOCUMENT_FORMAT_BY_MIME[mimeType.split(";")[0].trim()]
	if (!format) throw new Error(`Formato de documento não aceito pelo Bedrock: "${mimeType}". Aceitos: ${Object.values(DOCUMENT_FORMAT_BY_MIME).join(", ")}.`)

	const bytes = Buffer.from(base64, "base64")
	if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
		throw new Error(`Documento com ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB excede o limite de 4,5 MB do Bedrock.`)
	}

	// O nome é NEUTRO de propósito: a própria AWS documenta o campo como vetor de injeção
	// de prompt — o modelo pode ler o nome do arquivo como instrução.
	return { document: { format, name: `documento ${index}`, source: { bytes } } } as unknown as ContentBlock
}

// ── Conversão de mensagens (ModelMessage → Bedrock Converse) ──────────────────

/** Exportado só para teste: a conversão é a parte do adapter que já quebrou em silêncio. */
export function contentBlocksFromMessageForTest(msg: TextOptions["messages"][number]): ContentBlock[] {
	return contentBlocksFromMessage(msg)
}

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
		let documents = 0
		let images = 0
		for (const part of msg.content) {
			if (part.type === "text") {
				// Texto vazio é texto, não parte desconhecida: o `else` abaixo existe para tipo que
				// o adapter não sabe enviar. Resposta só com gráfico é persistida com conteúdo
				// vazio no sisub e volta como parte de texto vazia — derrubá-la mataria a
				// conversa inteira ao reabrir.
				if (part.content) blocks.push({ text: part.content })
			} else if (part.type === "image" && part.source.type === "data") {
				images += 1
				if (images > MAX_IMAGES_PER_MESSAGE) throw new Error(`Bedrock aceita no máximo ${MAX_IMAGES_PER_MESSAGE} imagens por mensagem.`)
				const format = (part.source.mimeType.split("/")[1] ?? "png") as "png" | "jpeg" | "gif" | "webp"
				blocks.push({
					image: { format, source: { bytes: Buffer.from(part.source.value, "base64") } },
				})
			} else if (part.type === "document" && part.source.type === "data") {
				documents += 1
				blocks.push(documentBlock(part.source.mimeType, part.source.value, documents))
			} else {
				// Parte não suportada NÃO pode sumir calada: o modelo responderia sobre o que
				// sobrou, e a resposta pareceria apenas ruim em vez de incompleta. Este `throw`
				// existe porque o descarte silencioso já esteve aqui.
				throw new Error(
					`Parte de mensagem não suportada pelo adapter do Bedrock: type="${part.type}"${"source" in part ? ` source="${part.source.type}"` : ""}.`
				)
			}
		}
		// Restrição do serviço: mensagem com documento exige um bloco de texto junto, ou a
		// chamada volta ValidationException sem dizer o motivo.
		if (documents > 0 && !blocks.some((block) => "text" in block)) {
			blocks.unshift({ text: "Documento anexado pelo usuário." })
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

function toUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined) {
	if (!usage) return undefined
	return { promptTokens: usage.inputTokens ?? 0, completionTokens: usage.outputTokens ?? 0, totalTokens: usage.totalTokens ?? 0 }
}

/** Nome da tool usada para arrancar saída estruturada do Converse. */
const STRUCTURED_OUTPUT_TOOL = "structured_output"

/**
 * Primeiro objeto JSON completo dentro de um texto.
 *
 * Varre contando chaves e ignorando o que está entre aspas, então tolera cerca
 * ```json, texto antes e — o caso que mais aparece — comentário do modelo DEPOIS
 * do objeto. Devolve `undefined` quando não há objeto parseável.
 */
export function extractJsonObject(text: string): unknown {
	const start = text.indexOf("{")
	if (start === -1) return undefined

	let depth = 0
	let inString = false
	let escaped = false

	for (let i = start; i < text.length; i++) {
		const char = text[i]
		if (inString) {
			if (escaped) escaped = false
			else if (char === "\\") escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"') inString = true
		else if (char === "{") depth++
		else if (char === "}") {
			depth--
			if (depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1))
				} catch {
					return undefined
				}
			}
		}
	}
	return undefined
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
	// Cliente resolvido preguiçosamente (injetável em teste): evita instanciar o
	// SDK — e disparar a cadeia de credenciais AWS — antes do primeiro uso real.
	let clientPromise: Promise<BedrockRuntimeClient> | undefined
	function getClient(): Promise<BedrockRuntimeClient> {
		if (client) return Promise.resolve(client)
		if (!clientPromise) {
			clientPromise = loadSdk().then((sdk) => new sdk.BedrockRuntimeClient(region ? { region } : {}))
		}
		return clientPromise
	}

	async function* chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
		// logger é obrigatório no TextOptions, mas guardamos por robustez (chamadas diretas em teste).
		const logger = options.logger
		const timestamp = Date.now()
		const runId = options.runId ?? generateId("run")
		const threadId = options.threadId ?? generateId("thread")
		const messageId = generateId("msg")

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

			const sdk = await loadSdk()
			const bedrock = await getClient()
			const response = await bedrock.send(new sdk.ConverseStreamCommand(buildConverseInput(model, options)), {
				abortSignal: options.abortController?.signal,
			})

			// RUN_STARTED sempre precede RUN_FINISHED — emitido antes do loop para
			// que um stream vazio (sem eventos) ainda respeite o protocolo AG-UI.
			yield asChunk({ type: "RUN_STARTED", runId, threadId, model, timestamp })

			for await (const ev of (response.stream ?? []) as AsyncIterable<ConverseStreamOutput>) {
				logger?.provider?.("provider=bedrock", { chunk: ev })

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
		const { chatOptions, outputSchema } = options
		const sdk = await loadSdk()
		const bedrock = await getClient()

		// Converse não tem json-mode, mas TEM tool use — e forçar uma tool cujo
		// inputSchema é o schema pedido é o que devolve JSON de verdade, validado
		// pelo provider. Pedir JSON por system prompt (o que se fazia aqui) funciona
		// em schema pequeno e falha em schema grande: o modelo passa a narrar o
		// resultado em markdown, ou fecha o JSON e emenda um comentário depois, e o
		// parse morre com "Falha ao parsear" sem dizer por quê.
		const input = buildConverseInput(model, chatOptions)
		if (outputSchema != null) {
			input.toolConfig = {
				tools: [
					{
						toolSpec: {
							name: STRUCTURED_OUTPUT_TOOL,
							description: "Devolve a resposta no formato estruturado exigido.",
							inputSchema: { json: outputSchema },
						},
					},
				],
				toolChoice: { tool: { name: STRUCTURED_OUTPUT_TOOL } },
			} as unknown as ToolConfiguration
		}

		const response = await bedrock.send(new sdk.ConverseCommand(input), {
			abortSignal: chatOptions.abortController?.signal,
		})

		const blocks = response.output?.message?.content ?? []
		const rawText = blocks.map((b) => ("text" in b && b.text ? b.text : "")).join("")

		// Caminho normal: o argumento da tool JÁ é o objeto.
		for (const block of blocks) {
			const toolUse = (block as { toolUse?: { name?: string; input?: unknown } }).toolUse
			if (toolUse?.name === STRUCTURED_OUTPUT_TOOL && toolUse.input != null) {
				return { data: toolUse.input, rawText: JSON.stringify(toolUse.input), usage: toUsage(response.usage) }
			}
		}

		// Modelo que ignorou a tool: sobra o texto. `extractJsonObject` tolera cerca
		// de markdown e prosa em volta — é comum o modelo emendar um "Observação:"
		// depois do JSON, e cortar só no fim da string perdia a resposta inteira.
		const data = extractJsonObject(rawText)
		if (data === undefined) {
			throw new Error(`Falha ao parsear saída estruturada como JSON. Conteúdo: ${rawText.slice(0, 200)}`)
		}

		return { data, rawText, usage: toUsage(response.usage) }
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
