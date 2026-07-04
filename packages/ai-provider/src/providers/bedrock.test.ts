import { describe, expect, it } from "bun:test"
import type { ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime"
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
