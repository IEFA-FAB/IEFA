import { describe, expect, it } from "bun:test"
import type { AgentState } from "../state.ts"
import { graderCondition, radaAgentCondition, routerCondition } from "./conditions.ts"

function makeState(overrides: Partial<AgentState>): AgentState {
	return {
		messages: [],
		session_id: "",
		user_id: undefined,
		intent: "UNKNOWN",
		original_query: "",
		reformulated_query: undefined,
		retrieved_documents: [],
		has_sufficient_context: false,
		min_rerank_threshold: 0.45,
		grounding_check: undefined,
		generated_response_draft: undefined,
		retrieval_iterations: 0,
		grading_retries: 0,
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

	it("routes SEFA_SYSTEMS to general_chat", () => {
		expect(routerCondition(makeState({ intent: "SEFA_SYSTEMS" }))).toBe("general_chat")
	})

	it("routes PROCUREMENT to general_chat", () => {
		expect(routerCondition(makeState({ intent: "PROCUREMENT" }))).toBe("general_chat")
	})

	it("routes GENERAL to general_chat", () => {
		expect(routerCondition(makeState({ intent: "GENERAL" }))).toBe("general_chat")
	})

	it("routes GREETING to general_chat", () => {
		expect(routerCondition(makeState({ intent: "GREETING" }))).toBe("general_chat")
	})

	it("routes UNKNOWN to general_chat", () => {
		expect(routerCondition(makeState({ intent: "UNKNOWN" }))).toBe("general_chat")
	})
})

describe("radaAgentCondition", () => {
	it("routes to grader when context is sufficient", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: true, retrieval_iterations: 0 }))).toBe("grader")
	})

	it("routes to grader even if iterations are high when context is sufficient", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: true, retrieval_iterations: 5 }))).toBe("grader")
	})

	it("routes to no_basis when iterations reach 3 and no context", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: false, retrieval_iterations: 3 }))).toBe("no_basis")
	})

	it("routes to no_basis when iterations exceed 3", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: false, retrieval_iterations: 10 }))).toBe("no_basis")
	})

	it("loops back to rada_agent when no context and iterations below 3", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: false, retrieval_iterations: 0 }))).toBe("rada_agent")
	})

	it("loops back to rada_agent on second iteration", () => {
		expect(radaAgentCondition(makeState({ has_sufficient_context: false, retrieval_iterations: 2 }))).toBe("rada_agent")
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

	it("routes to synthesizer when grounded despite high retry count", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: true, ungrounded_claims: ["claim"], confidence: 0.7 },
					grading_retries: 5,
				})
			)
		).toBe("synthesizer")
	})

	it("routes to no_basis when retries reach 2 and not grounded", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: false, ungrounded_claims: ["claim"], confidence: 0.2 },
					grading_retries: 2,
				})
			)
		).toBe("no_basis")
	})

	it("routes to no_basis when retries exceed 2 and not grounded", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: false, ungrounded_claims: ["claim"], confidence: 0.1 },
					grading_retries: 5,
				})
			)
		).toBe("no_basis")
	})

	it("routes to synthesizer when grounding_check is undefined and retries below max", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: undefined,
					grading_retries: 0,
				})
			)
		).toBe("synthesizer")
	})

	it("routes to synthesizer when not grounded and retries below max", () => {
		expect(
			graderCondition(
				makeState({
					grounding_check: { is_grounded: false, ungrounded_claims: ["x"], confidence: 0.3 },
					grading_retries: 1,
				})
			)
		).toBe("synthesizer")
	})
})
