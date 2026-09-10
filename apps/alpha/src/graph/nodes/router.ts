import { invokeStructured } from "../../lib/llm"
import { formatHistory, resolveSearchQuery } from "../conversation"
import type { AgentState, Intent } from "../state"

/**
 * Pré-passe do turno: classificar a intenção E produzir a consulta de busca.
 *
 * São duas decisões baratas sobre a mesma coisa — a pergunta no contexto da conversa — e
 * uma chamada só resolve as duas. Roda na camada `fast` (`ALPHA_FAST_AI_MODEL`), porque é
 * escolha entre seis rótulos e resolução de referência, não redação de resposta.
 */
const routerSchema = {
	name: "classify_intent",
	description: "Classifica a intenção e reescreve a pergunta como consulta autossuficiente",
	parameters: {
		type: "object",
		properties: {
			intent: {
				type: "string",
				enum: ["LEGISLATION", "SEFA_SYSTEMS", "PROCUREMENT", "GENERAL", "GREETING", "UNKNOWN"],
			},
			search_query: {
				type: "string",
				description:
					"A pergunta reescrita para busca, entendível SEM o histórico: pronomes e elipses resolvidos pelo assunto da conversa. Se a pergunta já se sustenta sozinha, repita-a como está.",
			},
		},
		required: ["intent", "search_query"],
	},
}

const SYSTEM_PROMPT = `Você é o pré-passe do sistema ATLAS da SEFA (Secretaria de Economia, Finanças e Administração da Aeronáutica). Faz duas coisas: classifica a intenção e prepara a consulta de busca.

O corpus consultável é o RADA-e — o Regulamento de Administração da Aeronáutica — e as normas
aeronáuticas correlatas (RBHA, ICA, MCA, NSCA). O RADA-e trata da ADMINISTRAÇÃO da Força:
agentes da administração, transmissão e assunção de cargo, patrimônio, material, licitação no
âmbito da OM, orçamento, prestação de contas, unidade gestora, boletim interno.

## 1. intent

- LEGISLATION: qualquer pergunta que o RADA-e ou uma norma aeronáutica possa responder —
  regulamentos, artigos, capítulos, procedimentos administrativos da Aeronáutica, e também
  PERGUNTA DE TERMINOLOGIA: "o que é", "o que significa", "para que serve", sigla solta
  (TTAC, TAC, UG, OM, RADA, SILOMS) ou termo técnico que você não reconhece.
- SEFA_SYSTEMS: sistemas internos da SEFA, módulos, processos de administração financeira e orçamentária
- PROCUREMENT: licitações, contratos, pregões e compras públicas regidos pela Lei 14.133 —
  legislação FEDERAL de contratação, fora do corpus aeronáutico
- GENERAL: perguntas genéricas, não classificadas nos acima
- GREETING: saudações, cumprimentos, despedidas
- UNKNOWN: impossível classificar

Regra de desempate: NA DÚVIDA, responda LEGISLATION. Errar para LEGISLATION custa uma busca no
corpus; errar para fora dele faz a pergunta ser respondida sem nenhum documento por trás.
Sigla que você não conhece NÃO é motivo para GENERAL — é motivo para LEGISLATION, porque é
exatamente o que o regulamento define.

## 2. search_query

A pergunta como ela vai à busca, entendível sem o histórico. Classifique pelo ASSUNTO da
conversa, e reescreva resolvendo o que a pergunta deixou implícito:

- "e o prazo?" depois de uma resposta sobre transmissão de cargo → "prazo para lavrar o
  Termo de Transmissão e Assunção de Cargo"
- "e se for interino?" → "substituição interina de Agente da Administração"

Regras:
- Se a pergunta já se sustenta sozinha, REPITA-A sem alterar. Não parafraseie, não
  "melhore", não traduza sigla que o usuário escreveu — a busca casa termo a termo.
- Uma consulta, não um resumo da conversa. Sem preâmbulo, sem aspas, sem explicação.
- Nunca invente assunto que não esteja na conversa.`

/** O histórico e a pergunta, no formato que o pré-passe recebe. */
function buildUserContent(history: string, query: string): string {
	return history ? `HISTÓRICO DA CONVERSA:\n${history}\n\nPERGUNTA ATUAL:\n${query}` : query
}

export async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
	const lastMessage = state.messages[state.messages.length - 1]
	const query = lastMessage?.content?.toString() ?? ""
	const history = formatHistory(state.messages)

	try {
		const result = await invokeStructured<{ intent: Intent; search_query?: string }>(
			routerSchema,
			[
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: buildUserContent(history, query) },
			],
			0,
			"fast"
		)

		const intent = result.intent ?? "UNKNOWN"
		return { intent, original_query: query, search_query: resolveSearchQuery(result.search_query, query, history.length > 0) }
	} catch (error) {
		// `UNKNOWN` vai ao corpus (`routerCondition`), então o classificador quebrado deixou
		// de transformar o ChatRADA num chat comum em silêncio — a busca acontece de qualquer
		// forma, com a pergunta crua. O aviso continua: ele é o que distingue "não soube
		// classificar" de "o pré-passe está quebrado", e sem ele a falha só aparece na conta
		// do Bedrock.
		console.warn(`[router] pré-passe falhou, caindo em UNKNOWN com a pergunta crua: ${error instanceof Error ? error.message : String(error)}`)
		return { intent: "UNKNOWN", original_query: query, search_query: query }
	}
}
