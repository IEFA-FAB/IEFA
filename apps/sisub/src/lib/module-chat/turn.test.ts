import type { UIMessage } from "@tanstack/ai-client"
import { describe, expect, test } from "vitest"
import { CLOSED_TURN, collectTurnRecord, extractToolCalls, hasAwaitingApproval, OPENED_TURN, resolveApprovalInterrupt, stepTurn, type TurnState } from "./turn"

type Part = UIMessage["parts"][number]

const toolPart = (extra: Record<string, unknown>): Part =>
	({ type: "tool-call", id: "call_1", name: "remove_menu_item", arguments: '{"itemId":"x"}', state: "input-complete", ...extra }) as unknown as Part
const text = (content: string): Part => ({ type: "text", content }) as Part
const msg = (id: string, role: "user" | "assistant", parts: Part[]): UIMessage => ({ id, role, parts }) as UIMessage

describe("extractToolCalls", () => {
	test("pedindo aprovação → awaiting-approval, com o id do interrupt", () => {
		const [call] = extractToolCalls([toolPart({ state: "approval-requested", approval: { id: "approval_call_1", needsApproval: true } })])
		expect(call).toMatchObject({ status: "awaiting-approval", approvalId: "approval_call_1" })
	})

	test("recusada → denied, mesmo com o `{ error }` que o servidor devolve na recusa", () => {
		const [call] = extractToolCalls([
			toolPart({
				state: "error",
				approval: { id: "approval_call_1", needsApproval: true, approved: false },
				output: { error: "User declined tool execution" },
			}),
		])
		expect(call.status).toBe("denied")
		expect(call.error).toBeUndefined()
	})

	test("aprovada e ainda sem resultado → calling; com resultado → done", () => {
		const approved = { id: "approval_call_1", needsApproval: true, approved: true }
		expect(extractToolCalls([toolPart({ approval: approved })])[0].status).toBe("calling")
		expect(extractToolCalls([toolPart({ approval: approved, output: { ok: true } })])[0]).toMatchObject({ status: "done", result: { ok: true } })
	})

	test("tool de leitura com erro segue como error", () => {
		expect(extractToolCalls([toolPart({ output: { error: "falhou" } })])[0]).toMatchObject({ status: "error", error: "falhou", isError: true })
	})
})

describe("collectTurnRecord", () => {
	test("junta a mensagem da ação e a da resposta do segundo run num registro só", () => {
		const messages = [
			msg("u0", "user", [text("antes")]),
			msg("a0", "assistant", [text("resposta antiga")]),
			msg("u1", "user", [text("remove o item")]),
			msg("a1", "assistant", [
				text("Vou remover."),
				toolPart({ approval: { id: "approval_call_1", needsApproval: true, approved: true }, output: { success: true } }),
			]),
			msg("a2", "assistant", [text("Pronto, removido.")]),
		]
		const record = collectTurnRecord(messages)
		expect(record?.content).toBe("Vou remover.\n\nPronto, removido.")
		expect(record?.toolCalls.map((c) => c.status)).toEqual(["done"])
	})

	test("turno só com ação recusada vale uma linha (denied é terminal)", () => {
		const record = collectTurnRecord([
			msg("u1", "user", [text("remove")]),
			msg("a1", "assistant", [toolPart({ approval: { id: "approval_call_1", needsApproval: true, approved: false } })]),
		])
		expect(record?.toolCalls.map((c) => c.status)).toEqual(["denied"])
	})

	test("turno parado na aprovação, sem texto, não vale linha", () => {
		expect(
			collectTurnRecord([
				msg("u1", "user", [text("remove")]),
				msg("a1", "assistant", [toolPart({ state: "approval-requested", approval: { id: "approval_call_1", needsApproval: true } })]),
			])
		).toBeNull()
	})
})

describe("hasAwaitingApproval", () => {
	test("só conta ação sem decisão", () => {
		const pending = msg("a1", "assistant", [toolPart({ approval: { id: "approval_call_1", needsApproval: true } })])
		const decided = msg("a1", "assistant", [toolPart({ approval: { id: "approval_call_1", needsApproval: true, approved: true } })])
		expect(hasAwaitingApproval([pending])).toBe(true)
		expect(hasAwaitingApproval([decided])).toBe(false)
	})
})

describe("stepTurn — grava uma vez, depois da decisão", () => {
	function run(frames: { isLoading: boolean; awaitingApproval: boolean }[], start: TurnState = OPENED_TURN): number {
		let turn = start
		let saves = 0
		for (const frame of frames) {
			const step = stepTurn(turn, frame)
			turn = step.turn
			if (step.persist) saves++
		}
		return saves
	}

	const idle = { isLoading: false, awaitingApproval: false }
	const loading = { isLoading: true, awaitingApproval: false }
	const interrupted = { isLoading: false, awaitingApproval: true }

	test("turno sem aprovação grava ao parar, uma vez", () => {
		expect(run([idle, loading, loading, idle, idle, idle])).toBe(1)
	})

	test("parada no interrupt não grava; o intervalo entre o clique e o run da decisão também não", () => {
		// envio → stream → interrupt → (clique: nada pendente, ainda não carregou) → stream da decisão → fim
		expect(run([loading, interrupted, interrupted, idle, idle, loading, idle, idle])).toBe(1)
	})

	test("sem decisão, nunca grava", () => {
		expect(run([loading, interrupted, interrupted, interrupted])).toBe(0)
	})

	test("duas aprovações seguidas no mesmo turno: grava só no fim", () => {
		expect(run([loading, interrupted, idle, loading, interrupted, idle, loading, idle])).toBe(1)
	})

	test("sem turno aberto (histórico carregado), não grava", () => {
		expect(run([loading, idle], CLOSED_TURN)).toBe(0)
	})
})

describe("resolveApprovalInterrupt", () => {
	test("responde o interrupt genérico com { approved }, e só ele", () => {
		const answers: unknown[] = []
		const interrupts = [{ id: "approval_call_1", kind: "generic", resolveInterrupt: (payload: unknown) => answers.push(payload) }]
		expect(resolveApprovalInterrupt(interrupts, "approval_call_1", false)).toBe(true)
		expect(answers).toEqual([{ approved: false }])
		expect(resolveApprovalInterrupt(interrupts, "approval_call_9", true)).toBe(false)
	})
})
