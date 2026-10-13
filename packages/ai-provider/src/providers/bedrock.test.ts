import { describe, expect, it } from "bun:test"
import type { ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime"
import { withFallbackChain } from "../fallback.js"
import { createAdapter } from "../index.js"
import { createBedrockChat } from "./bedrock.js"

// Cliente Bedrock falso: captura o último command enviado e devolve um stream
// pré-programado (ou uma saída não-stream para o ConverseCommand).
function fakeClient(events: ConverseStreamOutput[], nonStreamOutput?: unknown) {
	const sent: { input: unknown; name: string }[] = []
	const client = {
		send: async (command: { input: unknown; constructor: { name: string } }) => {
			sent.push({ input: command.input, name: command.constructor.name })
			if (command.constructor.name === "ConverseStreamCommand") {
				return {
					stream: (async function* () {
						for (const ev of events) yield ev
					})(),
				}
			}
			return nonStreamOutput ?? { output: { message: { content: [] } } }
		},
	}
	// biome-ignore lint/suspicious/noExplicitAny: cliente falso para teste
	return { client: client as any, sent }
}

async function collect(stream: AsyncIterable<unknown>) {
	const out: Record<string, unknown>[] = []
	for await (const ev of stream) out.push(ev as Record<string, unknown>)
	return out
}

// TextOptions mínimo aceito pelo adapter (campos extras são ignorados).
// biome-ignore lint/suspicious/noExplicitAny: shim de TextOptions para teste
const opts = (o: Record<string, unknown>) => o as any

describe("bedrock adapter — chatStream", () => {
	it("emite ciclo de texto (RUN_STARTED → TEXT_* → RUN_FINISHED)", async () => {
		const { client } = fakeClient([
			{ messageStart: { role: "assistant" } },
			{ contentBlockDelta: { delta: { text: "Olá" }, contentBlockIndex: 0 } },
			{ contentBlockDelta: { delta: { text: " mundo" }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
			{ messageStop: { stopReason: "end_turn" } },
			{ metadata: { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, metrics: { latencyMs: 42 } } },
		])
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		const events = await collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "oi" }] })))

		const types = events.map((e) => e.type)
		expect(types).toEqual(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"])

		const content = events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
		expect(content[0].delta).toBe("Olá")
		expect(content[1].content).toBe("Olá mundo")

		const finished = events.at(-1)
		expect(finished?.finishReason).toBe("stop")
		expect(finished?.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
	})

	it("emite ciclo de tool-call com input acumulado e parseado", async () => {
		const { client } = fakeClient([
			{ contentBlockStart: { start: { toolUse: { toolUseId: "t1", name: "get_weather" } }, contentBlockIndex: 0 } },
			{ contentBlockDelta: { delta: { toolUse: { input: '{"city":' } }, contentBlockIndex: 0 } },
			{ contentBlockDelta: { delta: { toolUse: { input: '"Recife"}' } }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
			{ messageStop: { stopReason: "tool_use" } },
		])
		const adapter = createBedrockChat("model-x", undefined, client)
		const events = await collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "clima?" }] })))

		const types = events.map((e) => e.type)
		expect(types).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_ARGS", "TOOL_CALL_END", "RUN_FINISHED"])

		const start = events.find((e) => e.type === "TOOL_CALL_START")
		expect(start?.toolCallId).toBe("t1")
		expect(start?.toolCallName).toBe("get_weather")

		const end = events.find((e) => e.type === "TOOL_CALL_END")
		expect(end?.input).toEqual({ city: "Recife" })

		expect(events.at(-1)?.finishReason).toBe("tool_calls")
	})

	it("propaga erro do cliente", async () => {
		const client = {
			send: async () => {
				throw new Error("boom")
			},
			// biome-ignore lint/suspicious/noExplicitAny: cliente falso para teste
		} as any
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		await expect(collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }] })))).rejects.toThrow("boom")
	})

	it("stream vazio ainda emite RUN_STARTED antes de RUN_FINISHED", async () => {
		const { client } = fakeClient([])
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		const events = await collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }] })))
		expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"])
	})
})

/** Troca id gerado e timestamp por marcadores estáveis, para comparar o evento inteiro. */
function normalize(events: Record<string, unknown>[]) {
	return events.map((e) => {
		const out: Record<string, unknown> = { ...e }
		for (const key of ["timestamp", "runId", "threadId", "messageId"]) if (key in out) out[key] = `<${key}>`
		if (typeof out.toolCallId === "string" && out.toolCallId.startsWith("tool_")) out.toolCallId = "<generated>"
		return out
	})
}

describe("bedrock adapter — chatStream, evento a evento", () => {
	// Eventos como objeto solto: a união do SDK não aceita evento parcial (o que o teste quer).
	const run = async (events: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
		const { client, sent } = fakeClient(events as unknown as ConverseStreamOutput[])
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		const out = await collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }], ...extra })))
		return { out, sent }
	}

	it("texto e tool intercalados: forma completa de cada evento, na ordem", async () => {
		const { out } = await run([
			{ messageStart: { role: "assistant" } },
			{ contentBlockDelta: { delta: { text: "Vou ver" }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
			{ contentBlockStart: { start: { toolUse: { toolUseId: "t1", name: "busca" } }, contentBlockIndex: 1 } },
			{ contentBlockDelta: { delta: { toolUse: { input: '{"q":1}' } }, contentBlockIndex: 1 } },
			{ contentBlockStop: { contentBlockIndex: 1 } },
			{ messageStop: { stopReason: "end_turn" } },
			{ metadata: { usage: { inputTokens: 4, outputTokens: 6 } } },
		])
		expect(normalize(out)).toEqual([
			{ type: "RUN_STARTED", runId: "<runId>", threadId: "<threadId>", model: "model-x", timestamp: "<timestamp>" },
			{ type: "TEXT_MESSAGE_START", messageId: "<messageId>", model: "model-x", timestamp: "<timestamp>", role: "assistant" },
			{ type: "TEXT_MESSAGE_CONTENT", messageId: "<messageId>", model: "model-x", timestamp: "<timestamp>", delta: "Vou ver", content: "Vou ver" },
			{ type: "TOOL_CALL_START", toolCallId: "t1", toolCallName: "busca", toolName: "busca", model: "model-x", timestamp: "<timestamp>", index: 1 },
			{ type: "TOOL_CALL_ARGS", toolCallId: "t1", model: "model-x", timestamp: "<timestamp>", delta: '{"q":1}', args: '{"q":1}' },
			{ type: "TOOL_CALL_END", toolCallId: "t1", toolCallName: "busca", toolName: "busca", model: "model-x", timestamp: "<timestamp>", input: { q: 1 } },
			{ type: "TEXT_MESSAGE_END", messageId: "<messageId>", model: "model-x", timestamp: "<timestamp>" },
			{
				type: "RUN_FINISHED",
				runId: "<runId>",
				threadId: "<threadId>",
				model: "model-x",
				timestamp: "<timestamp>",
				// Houve tool: `tool_calls` mesmo com stopReason `end_turn`. Total ausente = soma.
				finishReason: "tool_calls",
				usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
			},
		])
	})

	it("runId e threadId das opções passam direto", async () => {
		const { out } = await run([], { runId: "r1", threadId: "th1" })
		expect(out[0]).toMatchObject({ runId: "r1", threadId: "th1" })
		expect(out.at(-1)).toMatchObject({ runId: "r1", threadId: "th1", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: "stop" })
	})

	it("tool sem id nem nome e sem índice: id gerado, nome vazio, índice 0", async () => {
		const { out } = await run([
			{ contentBlockStart: { start: { toolUse: {} } } },
			{ contentBlockDelta: { delta: { toolUse: { input: "{}" } } } },
			{ contentBlockStop: {} },
		])
		expect(normalize(out).slice(1, 4)).toEqual([
			{ type: "TOOL_CALL_START", toolCallId: "<generated>", toolCallName: "", toolName: "", model: "model-x", timestamp: "<timestamp>", index: 0 },
			{ type: "TOOL_CALL_ARGS", toolCallId: "<generated>", model: "model-x", timestamp: "<timestamp>", delta: "{}", args: "{}" },
			{ type: "TOOL_CALL_END", toolCallId: "<generated>", toolCallName: "", toolName: "", model: "model-x", timestamp: "<timestamp>", input: {} },
		])
	})

	it("input de tool vazio fecha com {}: é a tool sem parâmetro", async () => {
		const { out } = await run([
			{ contentBlockStart: { start: { toolUse: { toolUseId: "a", name: "x" } }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
		])
		expect(out.filter((e) => e.type === "TOOL_CALL_END").map((e) => [e.toolCallId, e.input])).toEqual([["a", {}]])
		expect(out.at(-1)?.type).toBe("RUN_FINISHED")
	})

	// Resposta cortada por max_tokens no meio do argumento. Um TOOL_CALL_END com `{}` faria o
	// engine executar a tool sem argumento; o run tem de acabar em RUN_ERROR, sem TOOL_CALL_END
	// e sem RUN_FINISHED, ignorando o que o provider ainda mandar.
	it("input de tool truncado encerra o run com RUN_ERROR, sem TOOL_CALL_END nem RUN_FINISHED", async () => {
		const errs: string[] = []
		const { out } = await run(
			[
				{ contentBlockStart: { start: { toolUse: { toolUseId: "b", name: "busca" } }, contentBlockIndex: 0 } },
				{ contentBlockDelta: { delta: { toolUse: { input: '{"quebrado":' } }, contentBlockIndex: 0 } },
				{ contentBlockStop: { contentBlockIndex: 0 } },
				{ messageStop: { stopReason: "max_tokens" } },
				{ contentBlockStart: { start: { toolUse: { toolUseId: "c", name: "outra" } }, contentBlockIndex: 1 } },
			],
			{ logger: { errors: (msg: string) => errs.push(msg) } }
		)
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_ARGS", "RUN_ERROR"])
		expect(out.at(-1)).toMatchObject({ code: "tool-call-args-invalid", model: "model-x" })
		expect(String(out.at(-1)?.message)).toContain('"busca"')
		expect(errs).toEqual(["bedrock.chatStream tool-args JSON inválido"])
	})

	it("RUN_ERROR de argumento truncado passa pela cadeia de reserva sem trocar de provider", async () => {
		const primary = fakeClient([
			{ contentBlockStart: { start: { toolUse: { toolUseId: "b", name: "busca" } }, contentBlockIndex: 0 } },
			{ contentBlockDelta: { delta: { toolUse: { input: '{"q":' } }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
		] as unknown as ConverseStreamOutput[])
		const reserve = fakeClient([])
		const chain = withFallbackChain(createBedrockChat("model-a", "us-east-1", primary.client), createBedrockChat("model-b", "us-east-1", reserve.client))
		const out = await collect(chain.chatStream(opts({ messages: [{ role: "user", content: "x" }] })))
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_ARGS", "RUN_ERROR"])
		expect(reserve.sent).toHaveLength(0)
	})

	it("delta e fim de bloco sem tool aberta no índice não emitem nada; bloco fechado sai do mapa", async () => {
		const { out } = await run([
			{ contentBlockDelta: { delta: { toolUse: { input: "{}" } }, contentBlockIndex: 3 } },
			{ contentBlockStop: { contentBlockIndex: 3 } },
			{ contentBlockStart: { start: { toolUse: { toolUseId: "a", name: "x" } }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
			{ contentBlockDelta: { delta: { toolUse: { input: "{}" } }, contentBlockIndex: 0 } },
			{ contentBlockStop: { contentBlockIndex: 0 } },
		])
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_END", "RUN_FINISHED"])
	})

	it("texto vazio não abre mensagem; texto vazio com toolUse vai para a tool", async () => {
		const { out } = await run([
			{ contentBlockDelta: { delta: { text: "" }, contentBlockIndex: 0 } },
			{ contentBlockStart: { start: { toolUse: { toolUseId: "a", name: "x" } }, contentBlockIndex: 1 } },
			{ contentBlockDelta: { delta: { text: "", toolUse: { input: "{}" } }, contentBlockIndex: 1 } },
		])
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_ARGS", "RUN_FINISHED"])
	})

	it("início de bloco de texto (sem toolUse) não emite nada", async () => {
		const { out } = await run([{ contentBlockStart: { start: {}, contentBlockIndex: 0 } }])
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"])
	})

	it("stopReason e uso no mesmo evento valem os dois; o último uso vence", async () => {
		const { out } = await run([
			{ metadata: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } },
			{
				messageStop: { stopReason: "max_tokens" },
				metadata: { usage: { totalTokens: 9 } },
			},
		])
		expect(out.at(-1)).toMatchObject({ finishReason: "length", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 9 } })
	})

	it("metadata sem usage não mexe no uso", async () => {
		const { out } = await run([{ metadata: { metrics: { latencyMs: 1 } } }])
		expect(out.at(-1)?.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
	})

	it("logger: request antes, provider por evento, errors no fatal", async () => {
		const calls: string[] = []
		const logger = {
			request: (msg: string) => calls.push(`request:${msg}`),
			provider: (msg: string, meta: { chunk: unknown }) => calls.push(`provider:${msg}:${JSON.stringify(meta.chunk)}`),
			errors: (msg: string) => calls.push(`errors:${msg}`),
		}
		await run([{ messageStop: { stopReason: "end_turn" } }], { logger, tools: [{ name: "a" }] })
		expect(calls).toEqual([
			"request:activity=chat provider=bedrock model=model-x messages=1 tools=1 stream=true",
			'provider:provider=bedrock:{"messageStop":{"stopReason":"end_turn"}}',
		])

		const failing = {
			send: async () => {
				throw new Error("boom")
			},
			// biome-ignore lint/suspicious/noExplicitAny: cliente falso para teste
		} as any
		const errs: string[] = []
		const adapter = createBedrockChat("model-x", "us-east-1", failing)
		await expect(
			collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }], logger: { errors: (msg: string) => errs.push(msg) } })))
		).rejects.toThrow("boom")
		expect(errs).toEqual(["bedrock.chatStream fatal"])
	})

	it("erro no meio do stream é registrado e propagado depois dos eventos já emitidos", async () => {
		const client = {
			send: async () => ({
				stream: (async function* () {
					yield { contentBlockDelta: { delta: { text: "a" }, contentBlockIndex: 0 } }
					throw new Error("quebrou")
				})(),
			}),
			// biome-ignore lint/suspicious/noExplicitAny: cliente falso para teste
		} as any
		const seen: string[] = []
		const errs: string[] = []
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		const stream = adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }], logger: { errors: (msg: string) => errs.push(msg) } }))
		await expect(
			(async () => {
				for await (const ev of stream) seen.push((ev as { type: string }).type)
			})()
		).rejects.toThrow("quebrou")
		expect(seen).toEqual(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT"])
		expect(errs).toEqual(["bedrock.chatStream fatal"])
	})

	it("repassa o abortSignal ao send", async () => {
		let signal: unknown
		const client = {
			send: async (_command: unknown, options: { abortSignal?: unknown }) => {
				signal = options.abortSignal
				return { stream: undefined }
			},
			// biome-ignore lint/suspicious/noExplicitAny: cliente falso para teste
		} as any
		const abortController = new AbortController()
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		const out = await collect(adapter.chatStream(opts({ messages: [{ role: "user", content: "x" }], abortController })))
		expect(signal).toBe(abortController.signal)
		// `stream` ausente vale como stream vazio.
		expect(out.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"])
	})
})

describe("bedrock adapter — structuredOutput", () => {
	const schema = { type: "object", properties: { ok: { type: "boolean" } } }

	// Pedir JSON por system prompt funciona em schema pequeno e falha em schema
	// grande: o modelo passa a narrar em markdown. Tool use força o formato.
	it("força uma tool com o schema pedido e devolve o argumento dela", async () => {
		const { client, sent } = fakeClient([], {
			output: { message: { content: [{ toolUse: { name: "structured_output", input: { ok: true } } }] } },
			usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
		})
		// biome-ignore lint/suspicious/noExplicitAny: shim do adapter para teste
		const adapter = createBedrockChat("model-x", "us-east-1", client) as any
		const result = await adapter.structuredOutput({ chatOptions: opts({ messages: [{ role: "user", content: "dá o json" }] }), outputSchema: schema })

		expect(result.data).toEqual({ ok: true })
		expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 })

		const input = sent[0].input as { toolConfig?: { tools?: { toolSpec?: { name?: string; inputSchema?: { json?: unknown } } }[]; toolChoice?: unknown } }
		expect(sent[0].name).toBe("ConverseCommand")
		expect(input.toolConfig?.tools?.[0]?.toolSpec?.name).toBe("structured_output")
		expect(input.toolConfig?.tools?.[0]?.toolSpec?.inputSchema?.json).toEqual(schema)
		expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: "structured_output" } })
	})

	it("cai no texto quando o modelo ignora a tool", async () => {
		const { client } = fakeClient([], {
			output: { message: { content: [{ text: '```json\n{"ok":true}\n```' }] } },
		})
		// biome-ignore lint/suspicious/noExplicitAny: shim do adapter para teste
		const adapter = createBedrockChat("model-x", "us-east-1", client) as any
		const result = await adapter.structuredOutput({ chatOptions: opts({ messages: [{ role: "user", content: "x" }] }), outputSchema: schema })
		expect(result.data).toEqual({ ok: true })
	})

	it("falha com a resposta na mensagem quando não há JSON nenhum", async () => {
		const { client } = fakeClient([], { output: { message: { content: [{ text: "não vou responder em json" }] } } })
		// biome-ignore lint/suspicious/noExplicitAny: shim do adapter para teste
		const adapter = createBedrockChat("model-x", "us-east-1", client) as any
		expect(adapter.structuredOutput({ chatOptions: opts({ messages: [{ role: "user", content: "x" }] }), outputSchema: schema })).rejects.toThrow(
			/não vou responder em json/
		)
	})
})

describe("bedrock adapter — conversão de mensagens", () => {
	it("mapeia system prompts, coalesce tool-results e assistant toolCalls", async () => {
		const { client, sent } = fakeClient([{ messageStop: { stopReason: "end_turn" } }])
		const adapter = createBedrockChat("model-x", "us-east-1", client)
		await collect(
			adapter.chatStream(
				opts({
					systemPrompts: ["Você é um assistente.", { content: "Seja conciso." }],
					messages: [
						{ role: "user", content: "oi" },
						{
							role: "assistant",
							content: "",
							toolCalls: [{ id: "t1", type: "function", function: { name: "f", arguments: '{"a":1}' } }],
						},
						{ role: "tool", toolCallId: "t1", content: "resultado A" },
						{ role: "tool", toolCallId: "t2", content: "resultado B" },
					],
					tools: [{ name: "f", description: "faz algo", inputSchema: { type: "object", properties: {} } }],
					modelOptions: { temperature: 0.5, maxTokens: 512 },
				})
			)
		)

		const input = sent[0].input as {
			modelId: string
			system?: { text: string }[]
			messages: { role: string; content: Record<string, unknown>[] }[]
			toolConfig?: { tools: unknown[] }
			inferenceConfig?: Record<string, number>
		}

		expect(input.modelId).toBe("model-x")
		expect(input.system).toEqual([{ text: "Você é um assistente.\n\nSeja conciso." }])
		expect(input.inferenceConfig).toEqual({ maxTokens: 512, temperature: 0.5 })
		expect(input.toolConfig?.tools).toHaveLength(1)

		// user, assistant(toolUse), user(2 toolResults coalescidos)
		expect(input.messages).toHaveLength(3)
		expect(input.messages[0].role).toBe("user")
		expect(input.messages[1].role).toBe("assistant")
		expect(input.messages[1].content[0]).toEqual({ toolUse: { toolUseId: "t1", name: "f", input: { a: 1 } } })
		expect(input.messages[2].role).toBe("user")
		expect(input.messages[2].content).toHaveLength(2)
		expect(input.messages[2].content[0]).toEqual({ toolResult: { toolUseId: "t1", content: [{ text: "resultado A" }], status: "success" } })
		expect(input.messages[2].content[1]).toEqual({ toolResult: { toolUseId: "t2", content: [{ text: "resultado B" }], status: "success" } })
	})
})

describe("createAdapter — roteamento", () => {
	it("cria adapter bedrock", () => {
		const adapter = createAdapter({ provider: "bedrock", model: "meta.llama3-3-70b-instruct-v1:0", region: "us-east-1" })
		expect(adapter.name).toBe("bedrock")
		expect(adapter.model).toBe("meta.llama3-3-70b-instruct-v1:0")
	})
})
