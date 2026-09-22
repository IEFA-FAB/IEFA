import { describe, expect, it } from "bun:test"
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages"
import { type ChatAgentDeps, type ChatModel, type ChatTurnInput, MAX_TOOL_ROUNDS, runChatTurn, TOOL_BUDGET_EXHAUSTED, type ToolDefinition } from "./agent.ts"
import { makeDocument } from "./fixtures.test-helpers.ts"

type Round = { text?: string; call?: { name: string; args: Record<string, unknown> }; error?: Error }

/** Modelo falso: cada chamada consome a próxima rodada roteirizada. */
function fakeModel(id: string, rounds: Round[], seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []): ChatModel {
	let index = 0
	return {
		id,
		supportsCachePoint: false,
		async stream(messages, tools) {
			seen.push({ tools, messages })
			const round = rounds[index++] ?? { text: "fim" }
			if (round.error) throw round.error
			async function* chunks() {
				if (round.text) for (const piece of round.text.match(/.{1,5}/gs) ?? []) yield new AIMessageChunk({ content: piece })
				if (round.call) {
					yield new AIMessageChunk({
						content: "",
						tool_call_chunks: [{ name: round.call.name, args: JSON.stringify(round.call.args), id: `call-${index}`, index: 0, type: "tool_call_chunk" }],
					})
				}
			}
			return chunks()
		},
	}
}

function makeInput(overrides: Partial<ChatTurnInput> = {}): ChatTurnInput & { deltas: string[]; phases: string[] } {
	const deltas: string[] = []
	const phases: string[] = []
	return {
		rules: "regras",
		sources: "fontes",
		history: [],
		question: "O que a lei exige?",
		documents: [makeDocument()],
		documentTools: false,
		signal: new AbortController().signal,
		onPhase: (phase) => phases.push(phase),
		onDelta: (text) => deltas.push(text),
		deltas,
		phases,
		...overrides,
	}
}

function deps(overrides: Partial<ChatAgentDeps> = {}): ChatAgentDeps {
	return {
		primary: fakeModel("primario", [{ text: "Resposta direta." }]),
		fallback: null,
		isTransient: () => true,
		searchNorms: async () => ({ hits: [{ chunk_id: "chunk-9", content: "Art. 18 …", source: "Lei 14.133/2021", locator: "art. 18" }], unavailable: false }),
		...overrides,
	}
}

describe("runChatTurn", () => {
	it("sem ferramenta, transmite o texto e termina", async () => {
		const input = makeInput()
		const result = await runChatTurn(input, deps())

		expect(result.text).toBe("Resposta direta.")
		expect(input.deltas.join("")).toBe("Resposta direta.")
		expect(result.normas.size).toBe(0)
	})

	it("rodada de ferramenta seguida de texto: o trecho vira rótulo N citável", async () => {
		const seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		const primary = fakeModel(
			"primario",
			[{ text: "Vou conferir.", call: { name: "buscar_norma", args: { consulta: "ETP", corpus: "legislacao" } } }, { text: "O ETP é exigido [N1]." }],
			seen
		)
		const input = makeInput()
		const result = await runChatTurn(input, deps({ primary }))

		expect(result.normas.get("N1")).toEqual({ label: "N1", chunk_id: "chunk-9", source: "Lei 14.133/2021" })
		expect(result.text).toBe("Vou conferir.\n\nO ETP é exigido [N1].")
		expect(input.deltas.join("")).toBe(result.text)
		expect(input.phases).toContain("buscando_norma")
		// A resposta da ferramenta chegou ao modelo na rodada seguinte.
		expect(String(seen[1].messages.at(-1)?.content)).toContain('"rotulo":"N1"')
	})

	it("o mesmo trecho em duas buscas mantém o rótulo", async () => {
		const primary = fakeModel("primario", [
			{ call: { name: "buscar_norma", args: { consulta: "a", corpus: "legislacao" } } },
			{ call: { name: "buscar_norma", args: { consulta: "b", corpus: "legislacao" } } },
			{ text: "ok" },
		])
		const result = await runChatTurn(makeInput(), deps({ primary }))
		expect([...result.normas.keys()]).toEqual(["N1"])
	})

	it(`no teto de ${MAX_TOOL_ROUNDS} rodadas, avisa o modelo e não executa mais ferramenta`, async () => {
		const seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		const search = { call: { name: "buscar_norma", args: { consulta: "x", corpus: "legislacao" } } }
		const looping = Array.from({ length: MAX_TOOL_ROUNDS }, () => search)
		let searches = 0
		const primary = fakeModel("primario", [...looping, { text: "Respondo com o que tenho.", ...search }], seen)
		const result = await runChatTurn(
			makeInput(),
			deps({
				primary,
				searchNorms: async () => {
					searches += 1
					return { hits: [], unavailable: false }
				},
			})
		)

		expect(seen).toHaveLength(MAX_TOOL_ROUNDS + 1)
		// As ferramentas seguem declaradas na rodada final: o Bedrock recusa `toolUse` no
		// histórico sem `toolConfig`.
		expect(seen.at(-1)?.tools?.length).toBeGreaterThan(0)
		expect(String(seen.at(-1)?.messages.at(-1)?.content)).toContain(TOOL_BUDGET_EXHAUSTED)
		// A chamada da rodada final não roda.
		expect(searches).toBe(MAX_TOOL_ROUNDS)
		expect(result.text).toBe("Respondo com o que tenho.")
	})

	it("argumento inválido vira erro legível para o modelo, não exceção", async () => {
		const seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		const primary = fakeModel("primario", [{ call: { name: "buscar_norma", args: { consulta: "x", corpus: "jurisprudencia" } } }, { text: "ok" }], seen)
		await runChatTurn(makeInput(), deps({ primary }))
		expect(String(seen[1].messages.at(-1)?.content)).toContain("corpus deve ser um de")
	})

	it("busca fora do ar vira aviso ao modelo, e o turno segue", async () => {
		const seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		const primary = fakeModel(
			"primario",
			[{ call: { name: "buscar_norma", args: { consulta: "x", corpus: "legislacao" } } }, { text: "Não consegui conferir." }],
			seen
		)
		const result = await runChatTurn(
			makeInput(),
			deps({
				primary,
				searchNorms: async () => {
					throw new Error("rpc down")
				},
			})
		)
		expect(String(seen[1].messages.at(-1)?.content)).toContain("fora do ar")
		expect(result.normas.size).toBe(0)
	})

	it("ler_secao só existe quando algum documento veio como sumário", async () => {
		const seen: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		await runChatTurn(makeInput(), deps({ primary: fakeModel("p", [{ text: "ok" }], seen) }))
		expect(seen[0].tools?.map((tool) => tool.function.name)).toEqual(["buscar_norma"])

		const seenSummary: Array<{ tools: ToolDefinition[] | null; messages: BaseMessage[] }> = []
		const primary = fakeModel("p", [{ call: { name: "ler_secao", args: { documento: "D1", caminho: "3" } } }, { text: "ok" }], seenSummary)
		await runChatTurn(makeInput({ documentTools: true }), deps({ primary }))
		expect(seenSummary[0].tools?.map((tool) => tool.function.name)).toEqual(["buscar_norma", "ler_secao", "buscar_no_documento"])
		expect(String(seenSummary[1].messages.at(-1)?.content)).toContain('"rotulo":"D1:3"')
	})

	it("falha transitória antes do primeiro texto troca para a reserva", async () => {
		const primary = fakeModel("primario", [{ error: new Error("ThrottlingException") }])
		const fallback = fakeModel("reserva", [{ text: "da reserva" }])
		const result = await runChatTurn(makeInput(), deps({ primary, fallback }))

		expect(result.model).toBe("reserva")
		expect(result.text).toBe("da reserva")
	})

	it("falha depois de texto já transmitido NÃO troca de modelo", async () => {
		const primary = fakeModel("primario", [
			{ text: "Começo…", call: { name: "buscar_norma", args: { consulta: "x", corpus: "legislacao" } } },
			{ error: new Error("ThrottlingException") },
		])
		const fallback = fakeModel("reserva", [{ text: "outra resposta" }])

		await expect(runChatTurn(makeInput(), deps({ primary, fallback }))).rejects.toThrow("ThrottlingException")
	})

	it("falha não transitória propaga sem tentar a reserva", async () => {
		const primary = fakeModel("primario", [{ error: new Error("AccessDeniedException") }])
		const fallback = fakeModel("reserva", [{ text: "não devia" }])

		await expect(runChatTurn(makeInput(), deps({ primary, fallback, isTransient: () => false }))).rejects.toThrow("AccessDeniedException")
	})
})
