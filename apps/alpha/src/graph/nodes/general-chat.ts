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
 * Recebe tudo que o roteador não mandou para o corpus: saudação, pergunta geral, e — por
 * ora — `SEFA_SYSTEMS` e `PROCUREMENT`, cujas etapas próprias nunca foram construídas.
 *
 * Fora a saudação, a resposta é COMPOSTA em `composeNonRadaAnswer`, para que a ressalva de
 * procedência não dependa de o modelo lembrar dela. Antes este nó respondia em texto livre,
 * com o mesmo tom do caminho do RADA-e: quem perguntasse "o que é Unidade Gestora?" — que o
 * classificador manda para cá — recebia uma resposta de aparência normativa, sem nenhum
 * documento por trás e sem aviso nenhum.
 */
export async function generalChatNode(state: AgentState): Promise<Partial<AgentState>> {
	const final_response =
		state.intent === "GREETING"
			? await invokeText([{ role: "system", content: GREETING_PROMPT }, ...state.messages], 0.7)
			: composeNonRadaAnswer(await invokeStructured<NonRadaAnswer>(ANSWER_SCHEMA, [{ role: "system", content: ANSWER_PROMPT }, ...state.messages]))

	return {
		final_response,
		cited_documents: [],
		termination_reason: "success",
		messages: [new AIMessage(final_response)],
	}
}
