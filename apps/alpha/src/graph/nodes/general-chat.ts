import { AIMessage } from "@langchain/core/messages"
import { invokeStructured, invokeText } from "../../lib/llm"
import { composeNonRadaAnswer, type NonRadaAnswer } from "../provenance"
import type { AgentState } from "../state"

/**
 * Saudação não é afirmação: cumprimentar não atribui nada ao RADA-e, então este é o único
 * caminho deste nó que responde em texto livre.
 */
const GREETING_PROMPT = `Você é o ATLAS, assistente de consulta ao RADA-e (Regulamento de Administração da Aeronáutica) da SEFA.
Responda à saudação em uma ou duas frases, e diga que consulta o RADA-e.
NÃO afirme nada sobre normas, prazos, valores ou procedimentos.`

const ANSWER_SCHEMA = {
	name: "answer_outside_rada",
	description: "Resposta a uma pergunta que NÃO foi respondida a partir do RADA-e",
	parameters: {
		type: "object",
		properties: {
			hasAnswer: { type: "boolean", description: "Você sabe responder E consegue nomear a fonte?" },
			source: { type: "string", description: "Fonte identificável: norma, lei, sistema ou base de dados. Vazio se não houver." },
			answer: { type: "string", description: "A resposta, sem ressalvas — elas são acrescentadas depois." },
		},
		required: ["hasAnswer", "source", "answer"],
	},
}

const ANSWER_PROMPT = `Você é o ATLAS, da SEFA. A pergunta abaixo NÃO foi respondida a partir do RADA-e.

Só declare \`hasAnswer: true\` se puder NOMEAR a fonte da informação — uma norma, uma lei, um
sistema, uma base de dados. Conhecimento geral sem origem identificável NÃO conta: nesse caso
declare \`hasAnswer: false\`.

Nunca invente fonte. Na dúvida sobre a procedência, \`hasAnswer: false\`.`

/**
 * Responde o que não veio do RADA-e.
 *
 * Chega-se aqui por dois caminhos, e a diferença entre eles importa:
 *
 * 1. **Direto do roteador** — saudação e `PROCUREMENT`, que têm corpus próprio (o
 *    verificador de conformidade) ou não têm o que buscar. O corpus não foi consultado.
 * 2. **Corpus esgotado** — a busca rodou até o limite de iterações e não trouxe documento
 *    acima do limiar. Antes esse caminho terminava no `no_basis`, com uma frase fixa;
 *    agora termina aqui, porque o chat geral pode nomear uma fonte de fora do RADA-e e o
 *    `no_basis` não podia. `retrieval_outcome` distingue os dois, e é dele que sai o
 *    `termination_reason` gravado no `query_log`. Busca FORA DO AR não chega por aqui:
 *    `"unavailable"` vai ao `no_basis`, porque responder de memória do modelo uma pergunta
 *    sobre o regulamento é pior do que dizer que não deu.
 *
 * `SEFA_SYSTEMS` não chega mais pelo caminho (1) — administração da Aeronáutica é o assunto
 * do RADA-e, e era por esse desvio que "o que é Unidade Gestora?" recebia resposta de
 * aparência normativa sem nenhum documento por trás. Pelo caminho (2) ele chega, e deve: aí
 * o regulamento foi consultado e não tinha.
 *
 * Fora a saudação, a resposta é COMPOSTA em `composeNonRadaAnswer`, para que a ressalva de
 * procedência não dependa de o modelo lembrar dela.
 */
export async function generalChatNode(state: AgentState): Promise<Partial<AgentState>> {
	const final_response =
		state.intent === "GREETING"
			? await invokeText([{ role: "system", content: GREETING_PROMPT }, ...state.messages], 0.7)
			: composeNonRadaAnswer(await invokeStructured<NonRadaAnswer>(ANSWER_SCHEMA, [{ role: "system", content: ANSWER_PROMPT }, ...state.messages]))

	return {
		final_response,
		cited_documents: [],
		// Lido de `retrieval_outcome`, e não de `termination_reason`: aquele é zerado a cada
		// turno por `buildTurnInput`, este NÃO tem como ser (o LangGraph ignora `undefined`
		// no input) e traria o motivo da pergunta ANTERIOR da sessão — uma saudação depois de
		// uma busca vazia seria registrada como `no_documents_found`. `unavailable` não chega
		// aqui: busca fora do ar termina no `no_basis`.
		termination_reason: state.retrieval_outcome === null ? "success" : "no_documents_found",
		messages: [new AIMessage(final_response)],
	}
}
