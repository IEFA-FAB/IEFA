import type { AgentState, GroundingCheck } from "../state"

/**
 * A regra do silêncio é a falha medida, não estilo. Pergunta de comparação ("qual a
 * diferença entre interino e eventual?") convida a tabela, e tabela pede uma célula para
 * cada lado: quando a norma só fala de um deles, o modelo preenchia o outro por CONTRASTE
 * ("ao eventual não é permitido alterar ordens" virava "ao interino: permitido"). O juiz
 * marcava exatamente essa célula, e o rascunho inteiro caía.
 */
const DRAFT_SYSTEM_PROMPT = `Você é o ATLAS, assistente especializado em legislação aeronáutica.
Gere um rascunho de resposta usando EXCLUSIVAMENTE os documentos fornecidos.
Use citações inline no formato [¹], [²], etc.
NUNCA afirme algo além do que está nos documentos.
Silêncio do documento NÃO é regra: se ele trata de um aspecto só para um dos lados de uma comparação, diga que o documento não trata do outro — nunca deduza o outro lado por contraste, nem preencha célula de tabela por inferência.
Use os números como a norma escreve ("superior a 30 dias", não "a partir de 31 dias").`

const GRADING_SYSTEM_PROMPT = `Você é um verificador de alucinações em textos jurídico-aeronáuticos.
Dado um rascunho e documentos de suporte, verifique cada afirmação do rascunho.
Uma afirmação está "ancorada" se puder ser diretamente suportada por pelo menos um dos documentos fornecidos.`

const REVISION_SYSTEM_PROMPT = `Você é o ATLAS, assistente especializado em legislação aeronáutica.
Um verificador apontou afirmações do rascunho que os documentos não sustentam.
Reescreva o rascunho corrigindo SOMENTE essas afirmações: remova-as, ou reescreva-as no limite exato do que os documentos dizem.
Onde o documento é omisso, diga que ele não trata do ponto — não deduza.
Mantenha o restante do rascunho, as citações inline [¹], [²] e a estrutura.
Retorne APENAS o rascunho revisado.`

type Message = { role: "system" | "user"; content: string }

/** O modelo, por parâmetro: o teste do laço de revisão não pode depender de credencial. */
export interface GraderModel {
	text(messages: Message[]): Promise<string>
	grade(messages: Message[]): Promise<GroundingCheck>
}

async function checkGrounding(model: GraderModel, docsContext: string, draft: string): Promise<GroundingCheck> {
	const result = await model.grade([
		{ role: "system", content: GRADING_SYSTEM_PROMPT },
		{
			role: "user",
			content: `DOCUMENTOS DE SUPORTE:\n${docsContext}\n\nRASCUNHO PARA VERIFICAR:\n${draft}`,
		},
	])

	return {
		is_grounded: result.is_grounded,
		ungrounded_claims: result.ungrounded_claims ?? [],
		confidence: Math.max(0, Math.min(1, result.confidence ?? 0)),
	}
}

/**
 * Rascunho, verificação e — se reprovado — UMA revisão contra os mesmos documentos.
 *
 * A reprovação voltava à recuperação com a consulta reformulada. Mas o juiz reprova
 * afirmação, não busca: no caso medido os cinco trechos respondiam a pergunta, e o que
 * não se sustentava era UMA célula de tabela. Buscar de novo trocava trechos bons por
 * outros, o rascunho novo extrapolava em outro lugar, e o turno terminava na frase fixa
 * do `no_basis` — com o follow-up falhando onde a mesma pergunta, no turno anterior,
 * tinha passado. Revisar corrige o que o juiz apontou e cabe nos 60 s do SSE; o laço
 * de re-busca somado a ela não caberia.
 *
 * `grading_retries` conta as verificações reprovadas: 0 passou de primeira, 1 passou
 * depois da revisão, 2 esgotou — e aí é alucinação detectada.
 */
export async function gradeDraft(state: AgentState, model: GraderModel): Promise<Partial<AgentState>> {
	const { retrieved_documents, messages } = state

	const docsContext = retrieved_documents
		.map((d, i) => {
			// Só o que existe entra no rótulo. Documento sem dispositivo marcado rendia
			// `[1] RADA-e Módulo G — , :`, que é ruído no prompt do verificador.
			const device = [d.metadata.chapter, d.metadata.section, d.metadata.article].filter(Boolean).join(", ")
			return `[${i + 1}] ${d.metadata.source}${device ? ` — ${device}` : ""}:\n${d.content}`
		})
		.join("\n\n")

	// A pergunta resolvida contra o histórico, e não a última mensagem crua: o rascunho de
	// "e o prazo?" sairia sem assunto, e o verificador o marcaria como não-ancorado — o
	// pré-passe teria consertado a BUSCA e quebrado a geração no mesmo turno.
	const userQuery =
		state.search_query ||
		messages
			.filter((m) => m.type === "human")
			.pop()
			?.content?.toString() ||
		""

	const firstDraft = await model.text([
		{ role: "system", content: DRAFT_SYSTEM_PROMPT },
		{ role: "user", content: `DOCUMENTOS:\n${docsContext}\n\nPERGUNTA: ${userQuery}` },
	])

	const firstCheck = await checkGrounding(model, docsContext, firstDraft)
	if (firstCheck.is_grounded) {
		return { grounding_check: firstCheck, grading_retries: 0, generated_response_draft: firstDraft }
	}

	const claims = firstCheck.ungrounded_claims.map((claim, i) => `${i + 1}. ${claim}`).join("\n")
	const revisedDraft = await model.text([
		{ role: "system", content: REVISION_SYSTEM_PROMPT },
		{
			role: "user",
			content: `DOCUMENTOS:\n${docsContext}\n\nPERGUNTA: ${userQuery}\n\nRASCUNHO:\n${firstDraft}\n\nAFIRMAÇÕES SEM SUPORTE:\n${claims || "(o verificador não as listou — confira cada afirmação contra os documentos)"}`,
		},
	])

	const revisedCheck = await checkGrounding(model, docsContext, revisedDraft)
	if (revisedCheck.is_grounded) {
		return { grounding_check: revisedCheck, grading_retries: 1, generated_response_draft: revisedDraft }
	}

	return {
		grounding_check: revisedCheck,
		grading_retries: 2,
		generated_response_draft: revisedDraft,
		termination_reason: "hallucination_detected",
	}
}
