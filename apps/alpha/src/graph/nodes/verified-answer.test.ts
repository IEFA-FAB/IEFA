import { describe, expect, it } from "bun:test"
import type { AgentState } from "../state.ts"
import { buildVerifiedAnswer } from "./verified-answer.ts"

function makeState(overrides: Partial<AgentState>): AgentState {
	return {
		retrieved_documents: [
			{
				id: "c1",
				content: "…",
				metadata: { source: "RADA-e Módulo F", document_type: null, chapter: "4", section: "", article: "4.2.2", year: 2024, page: 1 },
				scores: { semantic_score: 1, keyword_score: 1, rerank_score: 1 },
			},
			{
				id: "c2",
				content: "…",
				metadata: { source: "ICA 172-3", document_type: null, chapter: "", section: "", article: "", year: 2023, page: 2 },
				scores: { semantic_score: 1, keyword_score: 1, rerank_score: 1 },
			},
		],
		grading_retries: 0,
		generated_response_draft: undefined,
		...overrides,
	} as unknown as AgentState
}

describe("buildVerifiedAnswer", () => {
	it("não responde quando o rascunho passou de primeira — quem responde é o sintetizador", () => {
		expect(buildVerifiedAnswer(makeState({ grading_retries: 0, generated_response_draft: "rascunho" }))).toBeNull()
	})

	it("responde com o rascunho revisado e a lista de fontes, sem chamar modelo", () => {
		const result = buildVerifiedAnswer(makeState({ grading_retries: 1, generated_response_draft: "A substituição eventual vai até 30 dias [¹]." }))

		expect(result?.final_response).toBe("A substituição eventual vai até 30 dias [¹].\n\n**Referências**\n\n- ¹ RADA-e Módulo F — 4, 4.2.2\n- ² ICA 172-3")
		expect(result?.cited_documents).toEqual(["c1", "c2"])
		expect(result?.termination_reason).toBe("success")
		expect(result?.messages).toHaveLength(1)
	})

	it("sem documento recuperado, não inventa seção de referências", () => {
		const result = buildVerifiedAnswer(makeState({ grading_retries: 1, generated_response_draft: "texto", retrieved_documents: [] }))

		expect(result?.final_response).toBe("texto")
	})

	it("sem rascunho não há o que responder", () => {
		expect(buildVerifiedAnswer(makeState({ grading_retries: 2 }))).toBeNull()
	})
})
