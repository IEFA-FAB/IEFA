import { getLLM } from "../../lib/llm"
import type { AgentState, GroundingCheck } from "../state"

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

const DRAFT_SYSTEM_PROMPT = `Você é o ATLAS, assistente especializado em legislação aeronáutica.
Gere um rascunho de resposta usando EXCLUSIVAMENTE os documentos fornecidos.
Use citações inline no formato [¹], [²], etc.
NUNCA afirme algo além do que está nos documentos.`

const GRADING_SYSTEM_PROMPT = `Você é um verificador de alucinações em textos jurídico-aeronáuticos.
Dado um rascunho e documentos de suporte, verifique cada afirmação do rascunho.
Uma afirmação está "ancorada" se puder ser diretamente suportada por pelo menos um dos documentos fornecidos.`

export async function graderNode(state: AgentState): Promise<Partial<AgentState>> {
	const { retrieved_documents, messages, grading_retries } = state

	const docsContext = retrieved_documents
		.map((d, i) => `[${i + 1}] ${d.metadata.source} — ${d.metadata.chapter}, ${d.metadata.article}:\n${d.content}`)
		.join("\n\n")

	const userQuery =
		messages
			.filter((m) => m._getType() === "human")
			.pop()
			?.content?.toString() ?? ""

	// Gera o draft aqui mesmo, para só então verificar
	const draftResponse = await getLLM(0).invoke([
		{ role: "system", content: DRAFT_SYSTEM_PROMPT },
		{ role: "user", content: `DOCUMENTOS:\n${docsContext}\n\nPERGUNTA: ${userQuery}` },
	])
	const draft = draftResponse.content.toString()

	const grader = getLLM(0).withStructuredOutput(gradingSchema)
	const result = (await grader.invoke([
		{ role: "system", content: GRADING_SYSTEM_PROMPT },
		{
			role: "user",
			content: `DOCUMENTOS DE SUPORTE:\n${docsContext}\n\nRASCUNHO PARA VERIFICAR:\n${draft}`,
		},
	])) as GroundingCheck

	const grounding_check: GroundingCheck = {
		is_grounded: result.is_grounded,
		ungrounded_claims: result.ungrounded_claims ?? [],
		confidence: Math.max(0, Math.min(1, result.confidence ?? 0)),
	}

	const newRetries = grounding_check.is_grounded ? grading_retries : grading_retries + 1
	const updates: Partial<AgentState> = {
		grounding_check,
		grading_retries: newRetries,
		generated_response_draft: draft,
	}

	if (!grounding_check.is_grounded && newRetries >= 2) {
		updates.termination_reason = "hallucination_detected"
	}

	return updates
}
