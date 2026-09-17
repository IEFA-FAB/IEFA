import { describe, expect, it } from "bun:test"
import type { AgentState, Intent } from "../state.ts"
import { graderCondition, radaAgentCondition, routerCondition } from "./conditions.ts"

function makeState(overrides: Partial<AgentState>): AgentState {
	return {
		messages: [],
		session_id: "",
		user_id: undefined,
		intent: "UNKNOWN",
		original_query: "",
		search_query: "",
		reformulated_query: null,
		retrieved_documents: [],
		has_sufficient_context: false,
		min_rerank_threshold: 0.45,
		grounding_check: undefined,
		generated_response_draft: undefined,
		retrieval_iterations: 0,
		grading_retries: 0,
		retrieval_outcome: null,
		retrieval_halted: false,
		termination_reason: undefined,
		final_response: undefined,
		cited_documents: [],
		...overrides,
	} as AgentState
}

describe("routerCondition", () => {
	it("routes LEGISLATION to rada_agent", () => {
		expect(routerCondition(makeState({ intent: "LEGISLATION" }))).toBe("rada_agent")
	})

	// Regressão: o RADA-e É o Regulamento de Administração da Aeronáutica. Enquanto este
	// rótulo caía no chat geral, "o que é Unidade Gestora?" e "o que é um TTAC?" eram
	// respondidos de memória do modelo, sem consultar o regulamento que os define.
	it("routes SEFA_SYSTEMS to rada_agent", () => {
		expect(routerCondition(makeState({ intent: "SEFA_SYSTEMS" }))).toBe("rada_agent")
	})

	// A dúvida do classificador passa a custar uma busca, não uma resposta sem lastro.
	it("routes GENERAL to rada_agent", () => {
		expect(routerCondition(makeState({ intent: "GENERAL" }))).toBe("rada_agent")
	})

	it("routes UNKNOWN to rada_agent", () => {
		expect(routerCondition(makeState({ intent: "UNKNOWN" }))).toBe("rada_agent")
	})

	it("routes GREETING to general_chat", () => {
		expect(routerCondition(makeState({ intent: "GREETING" }))).toBe("general_chat")
	})

	// Contratação federal tem corpus próprio: `RADA_CORPUS_FILTER` escopa a busca do chat
	// à legislação aeronáutica, e a Lei 14.133 não está nela.
	it("routes PROCUREMENT to general_chat", () => {
		expect(routerCondition(makeState({ intent: "PROCUREMENT" }))).toBe("general_chat")
	})

	// O que a regra garante, varrendo o tipo inteiro: consultar o corpus é o PADRÃO, e a
	// lista de quem escapa é fechada. Rótulo novo no `Intent` passa a nascer consultando —
	// que é o lado seguro do erro.
	it("only greeting and federal procurement skip the corpus", () => {
		const intents: Intent[] = ["LEGISLATION", "SEFA_SYSTEMS", "PROCUREMENT", "GENERAL", "GREETING", "UNKNOWN"]
		const skipped = intents.filter((intent) => routerCondition(makeState({ intent })) !== "rada_agent")

		expect(skipped).toEqual(["PROCUREMENT", "GREETING"])
	})
})

describe("radaAgentCondition", () => {
	it("routes to grader when context is sufficient", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: true, retrieval_iterations: 0 }))).toBe("grader")
	})

	it("routes to grader even if iterations are high when context is sufficient", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: true, retrieval_iterations: 5 }))).toBe("grader")
	})

	// Esgotar a busca cai no chat geral, e não no `no_basis`: o piso é o mesmo (sem fonte
	// nomeada, `composeNonRadaAnswer` devolve a MESMA frase), e o teto é maior — o chat
	// geral consegue responder declarando uma fonte de fora do RADA-e.
	it("falls back to general_chat when iterations reach 3 and no context", () => {
		expect(radaAgentCondition(makeState({ intent: "LEGISLATION", has_sufficient_context: false, retrieval_iterations: 3 }))).toBe("general_chat")
	})

	it("falls back to general_chat when iterations exceed 3", () => {
		expect(radaAgentCondition(makeState({ intent: "LEGISLATION", has_sufficient_context: false, retrieval_iterations: 10 }))).toBe("general_chat")
	})

	// Sem alucinação no turno, o `no_basis` deixou de ser alcançável por aqui.
	it("never routes to no_basis without a flagged draft", () => {
		for (const retrieval_iterations of [0, 1, 2, 3, 10]) {
			expect(radaAgentCondition(makeState({ intent: "LEGISLATION", has_sufficient_context: false, retrieval_iterations }))).not.toBe("no_basis")
		}
	})

	// Busca fora do ar não pode virar resposta de memória do modelo com cara de normal.
	it("routes an unavailable search to no_basis, not to general_chat", () => {
		expect(
			radaAgentCondition(
				makeState({
					intent: "LEGISLATION",
					has_sufficient_context: false,
					retrieval_iterations: 3,
					retrieval_outcome: "unavailable",
				})
			)
		).toBe("no_basis")
	})

	// Corpus consultado e vazio é outra coisa: o chat geral responde, com a ressalva.
	it("routes an empty corpus to general_chat", () => {
		expect(
			radaAgentCondition(
				makeState({
					intent: "LEGISLATION",
					has_sufficient_context: false,
					retrieval_iterations: 3,
					retrieval_outcome: "empty",
				})
			)
		).toBe("general_chat")
	})

	// Reformulação indisponível encerra o laço SEM inflar o contador: repetir a mesma
	// consulta contra uma busca determinística devolveria os mesmos zero documentos.
	it("stops looping when retrieval is halted, even with iterations left", () => {
		expect(
			radaAgentCondition(
				makeState({
					intent: "LEGISLATION",
					has_sufficient_context: false,
					retrieval_iterations: 1,
					retrieval_halted: true,
					retrieval_outcome: "empty",
				})
			)
		).toBe("general_chat")
	})

	it("keeps the general_chat fallback for an exhausted turn that never drafted", () => {
		expect(
			radaAgentCondition(
				makeState({
					intent: "LEGISLATION",
					has_sufficient_context: false,
					retrieval_iterations: 3,
					grading_retries: 0,
					grounding_check: undefined,
				})
			)
		).toBe("general_chat")
	})

	it("loops back to rada_agent when no context and iterations below 3", () => {
		expect(radaAgentCondition(makeState({ intent: "LEGISLATION", has_sufficient_context: false, retrieval_iterations: 0 }))).toBe("rada_agent")
	})

	it("loops back to rada_agent on second iteration", () => {
		expect(radaAgentCondition(makeState({ intent: "LEGISLATION", has_sufficient_context: false, retrieval_iterations: 2 }))).toBe("rada_agent")
	})

	// A dúvida do classificador paga UMA busca: se o RADA-e não respondeu de primeira,
	// reformular "qual a capital da França" com vocabulário normativo não faz aparecer, e
	// cada rodada extra corre contra o corte de 60 s do SSE.
	it("gives an uncertain question a single retrieval, not three", () => {
		for (const intent of ["GENERAL", "UNKNOWN"] as const) {
			expect(radaAgentCondition(makeState({ intent, has_sufficient_context: false, retrieval_iterations: 0 }))).toBe("rada_agent")
			expect(radaAgentCondition(makeState({ intent, has_sufficient_context: false, retrieval_iterations: 1 }))).toBe("general_chat")
		}
	})

	it("keeps the full budget for a domain question", () => {
		for (const intent of ["LEGISLATION", "SEFA_SYSTEMS"] as const) {
			expect(radaAgentCondition(makeState({ intent, has_sufficient_context: false, retrieval_iterations: 1 }))).toBe("rada_agent")
			expect(radaAgentCondition(makeState({ intent, has_sufficient_context: false, retrieval_iterations: 3 }))).toBe("general_chat")
		}
	})
})

describe("graderCondition", () => {
	it("routes to synthesizer when grounding check passes", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: true, ungrounded_claims: [], confidence: 0.95 },
					grading_retries: 0,
				})
			)
		).toBe("synthesizer")
	})

	// Passou depois da revisão dentro do grader.
	it("routes to synthesizer when the revised draft is grounded", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: true, ungrounded_claims: [], confidence: 0.9 },
					grading_retries: 1,
				})
			)
		).toBe("synthesizer")
	})

	// Regressão: reprovar voltava à recuperação com a consulta reformulada, que trocava os
	// trechos que respondiam a pergunta por outros. A segunda chance agora é a revisão, dentro
	// do grader — o que sai dele reprovado já a gastou.
	it("never retries retrieval after grading", () => {
		for (const grading_retries of [0, 1, 2, 5]) {
			const route = graderCondition(
				makeState({
					grounding_check: { is_grounded: false, ungrounded_claims: ["x"], confidence: 0.1 },
					grading_retries,
				})
			)
			expect(route).toBe("no_basis")
		}
	})

	it("routes to no_basis when grounding_check is missing", () => {
		expect(graderCondition(makeState({ grounding_check: undefined }))).toBe("no_basis")
	})
})
