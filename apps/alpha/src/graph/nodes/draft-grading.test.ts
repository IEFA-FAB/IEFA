import { describe, expect, it } from "bun:test"
import type { AgentState, GroundingCheck } from "../state.ts"
import { type GraderModel, gradeDraft } from "./draft-grading.ts"

function makeState(): AgentState {
	return {
		messages: [],
		search_query: "qual a diferença entre substituição interina e eventual?",
		retrieved_documents: [
			{
				id: "c1",
				content: "4.2.2 c) eventual: quando o militar se afasta do cargo por período de até trinta dias.",
				metadata: { source: "RADA-e Módulo F", document_type: null, chapter: "4", article: "4.2.2", year: 2024, page: 1 },
				scores: { semantic_score: 1, keyword_score: 1, rerank_score: 1 },
			},
		],
	} as unknown as AgentState
}

/** Modelo roteirizado: devolve os rascunhos e os vereditos na ordem, e grava cada chamada. */
function scriptedModel(drafts: string[], checks: GroundingCheck[]) {
	const calls: Array<{ kind: "text" | "grade"; content: string }> = []
	const model: GraderModel = {
		text: async (messages) => {
			calls.push({ kind: "text", content: messages.map((m) => m.content).join("\n") })
			const next = drafts.shift()
			if (next === undefined) throw new Error("rascunho não roteirizado")
			return next
		},
		grade: async (messages) => {
			calls.push({ kind: "grade", content: messages.map((m) => m.content).join("\n") })
			const next = checks.shift()
			if (next === undefined) throw new Error("veredito não roteirizado")
			return next
		},
	}
	return { model, calls }
}

const grounded: GroundingCheck = { is_grounded: true, ungrounded_claims: [], confidence: 0.9 }
const cellClaim = "A coluna 'Cargo do titular' indica 'Mantido' para a eventual, e o documento não diz isso."
const ungrounded: GroundingCheck = { is_grounded: false, ungrounded_claims: [cellClaim], confidence: 0.8 }

describe("gradeDraft", () => {
	it("aprovado de primeira não gasta a revisão", async () => {
		const { model, calls } = scriptedModel(["rascunho"], [grounded])
		const result = await gradeDraft(makeState(), model)

		expect(result.grading_retries).toBe(0)
		expect(result.generated_response_draft).toBe("rascunho")
		expect(result.termination_reason).toBeUndefined()
		expect(calls.map((c) => c.kind)).toEqual(["text", "grade"])
	})

	// O caso medido: o follow-up tinha os trechos certos e uma célula de tabela extrapolada.
	// O turno terminava na frase fixa do `no_basis`.
	it("revisa o rascunho reprovado contra os mesmos documentos, com as afirmações apontadas", async () => {
		const { model, calls } = scriptedModel(["rascunho com célula inventada", "rascunho revisado"], [ungrounded, grounded])
		const result = await gradeDraft(makeState(), model)

		expect(result.grading_retries).toBe(1)
		expect(result.generated_response_draft).toBe("rascunho revisado")
		expect(result.grounding_check?.is_grounded).toBe(true)
		expect(result.termination_reason).toBeUndefined()

		const revision = calls[2]
		expect(revision?.kind).toBe("text")
		expect(revision?.content).toContain(cellClaim)
		expect(revision?.content).toContain("rascunho com célula inventada")
		expect(revision?.content).toContain("até trinta dias")
		// A verificação final é do rascunho REVISADO, não do original.
		expect(calls[3]?.content).toContain("rascunho revisado")
	})

	it("revisão também reprovada esgota: alucinação detectada, sem terceira tentativa", async () => {
		const { model, calls } = scriptedModel(["rascunho", "revisado"], [ungrounded, ungrounded])
		const result = await gradeDraft(makeState(), model)

		expect(result.grading_retries).toBe(2)
		expect(result.grounding_check?.is_grounded).toBe(false)
		expect(result.termination_reason).toBe("hallucination_detected")
		expect(calls).toHaveLength(4)
	})
})
