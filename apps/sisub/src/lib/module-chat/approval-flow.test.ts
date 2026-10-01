/**
 * Ida e volta da aprovação humana, com as duas pontas reais do `@tanstack/ai`: o `ChatClient`
 * (o mesmo que o `useChat` do hook usa) fala com um servidor que faz exatamente o que a rota
 * `module-chat/stream.post.ts` faz com o corpo — `chatParamsFromRequestBody`, validação do
 * `resume`, higiene do histórico, `chat()` com `threadId`/`runId`/`parentRunId`/`resume`.
 * Só o modelo é falso.
 *
 * O que trava aqui é o que nenhum teste de unidade pega: o formato do corpo que o cliente
 * manda no segundo turno, o interrupt chegar como `generic` (sem as tools no cliente) e o
 * resultado da call cair numa mensagem e a resposta do modelo em outra.
 */

import type { AnyTextAdapter } from "@tanstack/ai"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client"
import { describe, expect, test } from "vitest"
import { assertResumeMatchesPending, ChatRequestError, parseApprovalResume, sanitizeClientMessages } from "@/lib/chat-client-messages"
import { type ModuleToolDefinition, requiresApproval, type ToolContext, toolOk, wrapTool } from "./tools/shared"
import { collectTurnRecord, hasAwaitingApproval, resolveApprovalInterrupt } from "./turn"

const ctx = { userId: "u", permissions: [], module: "global", supabase: {}, db: {} } as unknown as ToolContext

type ModelMessage = { role: string; content?: unknown; toolCallId?: string }

interface Harness {
	client: ChatClient
	bodies: Record<string, unknown>[]
	modelTurns: ModelMessage[][]
	executed: string[]
	statuses: number[]
}

/** Servidor com o mesmo pipeline da rota e um modelo que pede `toolName` e depois responde. */
function harness(toolName: string, requiredLevel: 1 | 2): Harness {
	const executed: string[] = []
	const bodies: Record<string, unknown>[] = []
	const modelTurns: ModelMessage[][] = []
	const statuses: number[] = []

	const def: ModuleToolDefinition = {
		name: toolName,
		description: "tool de teste",
		parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
		requiredLevel,
		handler: async (args) => {
			executed.push(String(args.name))
			return toolOk({ id: "r1" })
		},
	}
	const tools = [wrapTool(def, ctx)]
	const approvalTools = new Set(requiresApproval(def) ? [def.name] : [])

	const now = () => Date.now()
	const adapter = {
		kind: "text",
		name: "fake",
		model: "fake",
		chatStream: async function* (options: { messages: ModelMessage[] }) {
			modelTurns.push(options.messages)
			const last = options.messages[options.messages.length - 1]
			yield { type: "RUN_STARTED", runId: "r", threadId: "t", timestamp: now() }
			if (last.role === "tool") {
				const messageId = `answer-${modelTurns.length}`
				yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: now() }
				yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Pronto.", timestamp: now() }
				yield { type: "TEXT_MESSAGE_END", messageId, timestamp: now() }
				yield { type: "RUN_FINISHED", runId: "r", threadId: "t", finishReason: "stop", timestamp: now() }
				return
			}
			yield { type: "TOOL_CALL_START", toolCallId: "call_1", toolCallName: toolName, toolName, timestamp: now() }
			yield { type: "TOOL_CALL_ARGS", toolCallId: "call_1", delta: '{"name":"Arroz"}', timestamp: now() }
			yield { type: "TOOL_CALL_END", toolCallId: "call_1", toolCallName: toolName, toolName, input: { name: "Arroz" }, timestamp: now() }
			yield { type: "RUN_FINISHED", runId: "r", threadId: "t", finishReason: "tool_calls", timestamp: now() }
		},
	} as unknown as AnyTextAdapter

	const fetchClient = async (_url: string, init: RequestInit): Promise<Response> => {
		const body = JSON.parse(String(init.body)) as Record<string, unknown>
		bodies.push(body)
		const params = await chatParamsFromRequestBody(body)
		try {
			const resume = parseApprovalResume(params.resume)
			const messages = sanitizeClientMessages(params.messages, { approvalTools, resume })
			assertResumeMatchesPending(messages, resume)
			statuses.push(200)
			const stream = chat({ adapter, messages, tools, threadId: params.threadId, runId: params.runId, parentRunId: params.parentRunId, resume })
			return toServerSentEventsResponse(stream)
		} catch (error) {
			if (!(error instanceof ChatRequestError)) throw error
			statuses.push(error.status)
			return new Response(error.message, { status: error.status })
		}
	}

	const client = new ChatClient({ connection: fetchServerSentEvents("/api/module-chat/stream", { fetchClient: fetchClient as typeof fetch }) })
	return { client, bodies, modelTurns, executed, statuses }
}

/** O resume roda fora do `await` de quem decide; espera o cliente voltar a ficar parado. */
async function settle(client: ChatClient): Promise<void> {
	for (let i = 0; i < 200; i++) {
		await new Promise((r) => setTimeout(r, 5))
		const state = client.getInterruptState()
		if (!(client as unknown as { isLoading: boolean }).isLoading && !state.resuming) return
	}
	throw new Error("o cliente não terminou o turno")
}

/** O que o hook faz no clique: atualiza o cartão e responde o interrupt. */
async function decide(client: ChatClient, approved: boolean): Promise<void> {
	await client.addToolApprovalResponse({ id: "approval_call_1", approved })
	expect(resolveApprovalInterrupt(client.getInterrupts(), "approval_call_1", approved)).toBe(true)
	await settle(client)
}

describe("aprovação humana no chat dos módulos (ida e volta real)", () => {
	test("tool de escrita para antes de executar e espera decisão", async () => {
		const h = harness("create_recipe", 2)
		await h.client.sendMessage("cria arroz")

		expect(h.executed).toEqual([])
		expect(hasAwaitingApproval(h.client.getMessages())).toBe(true)
		expect(h.client.getInterrupts().map((i) => i.id)).toEqual(["approval_call_1"])
		// Nada que valha linha no histórico ainda: a call não terminou.
		expect(collectTurnRecord(h.client.getMessages())).toBeNull()
		// Com interrupt pendente o cliente recusa mensagem nova — é por isso que o input trava.
		await expect(h.client.sendMessage("outra")).rejects.toThrow(/pending interrupts/)
	})

	test("Confirmar executa uma vez, com os argumentos mostrados, e o turno grava ação + resposta", async () => {
		const h = harness("create_recipe", 2)
		await h.client.sendMessage("cria arroz")
		await decide(h.client, true)

		expect(h.executed).toEqual(["Arroz"])
		expect(h.statuses).toEqual([200, 200])
		expect(h.bodies[1]).toMatchObject({
			parentRunId: h.bodies[0].runId,
			resume: [{ interruptId: "approval_call_1", status: "resolved", payload: { approved: true } }],
		})
		expect(h.client.getInterrupts()).toEqual([])
		expect(hasAwaitingApproval(h.client.getMessages())).toBe(false)

		// O resultado volta na mensagem da call e a resposta numa mensagem nova: o registro do
		// turno junta as duas, senão a ação sumia do histórico.
		const record = collectTurnRecord(h.client.getMessages())
		expect(record?.content).toBe("Pronto.")
		expect(record?.toolCalls).toEqual([expect.objectContaining({ id: "call_1", name: "create_recipe", status: "done", result: { id: "r1" } })])
	})

	test("Recusar não executa, o modelo recebe a recusa e o turno grava a call como `denied`", async () => {
		const h = harness("remove_menu_item", 2)
		await h.client.sendMessage("remove o item")
		await decide(h.client, false)

		expect(h.executed).toEqual([])
		expect(h.statuses).toEqual([200, 200])
		const toolMessage = h.modelTurns[1].find((m) => m.role === "tool")
		expect(String(toolMessage?.content)).toMatch(/declined/i)

		const record = collectTurnRecord(h.client.getMessages())
		expect(record?.toolCalls).toEqual([expect.objectContaining({ id: "call_1", status: "denied" })])
		expect(record?.toolCalls[0].error).toBeUndefined()
	})

	test("tool de leitura executa direto, sem aprovação", async () => {
		const h = harness("list_recipes", 1)
		await h.client.sendMessage("lista")
		await settle(h.client)

		expect(h.executed).toEqual(["Arroz"])
		expect(h.client.getInterrupts()).toEqual([])
		expect(collectTurnRecord(h.client.getMessages())?.toolCalls).toEqual([expect.objectContaining({ status: "done" })])
	})
})
