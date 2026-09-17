import { invokeStructured, invokeText } from "../../lib/llm"
import type { AgentState, GroundingCheck } from "../state"
import { type GraderModel, gradeDraft } from "./draft-grading"

const gradingSchema = {
	name: "grading_result",
	description: "Result of hallucination check",
	parameters: {
		type: "object",
		properties: {
			is_grounded: { type: "boolean" },
			ungrounded_claims: { type: "array", items: { type: "string" } },
			confidence: { type: "number", minimum: 0, maximum: 1 },
		},
		required: ["is_grounded", "ungrounded_claims", "confidence"],
	},
}

const defaultModel: GraderModel = {
	text: (messages) => invokeText(messages),
	grade: (messages) => invokeStructured<GroundingCheck>(gradingSchema, messages),
}

/** Nó do grafo. Não aceita o modelo por parâmetro: o LangGraph passa `config` como segundo argumento. */
export function graderNode(state: AgentState): Promise<Partial<AgentState>> {
	return gradeDraft(state, defaultModel)
}
