import { AERONAUTICAL_DOCUMENT_TYPES } from "../../lib/corpora"
import { invokeText } from "../../lib/llm"
import type { RADARetrieverOutput } from "../../tools/rada-retriever"
import { radaRetriever } from "../../tools/rada-retriever"
import { retrievalBudget } from "../edges/conditions"
import type { AgentState } from "../state"

/**
 * A reformulação é a segunda chance da pergunta, e as duas regras novas atacam falhas
 * medidas na recuperação, não estilo:
 *
 * - **Sigla por extenso**: a perna semântica não sabe o que é "TTAC" — o vetor de um
 *   acrônimo desconhecido não fica perto do trecho que o define. Quem casa é o extenso,
 *   que é como a norma escreve.
 * - **Fora as palavras interrogativas**: `match_chunks_fts` usa `websearch_to_tsquery`,
 *   que CONJUNTA os termos. "o que significa TTAC na FAB" exige `signific` E `ttac` E
 *   `fab` no mesmo trecho; a perna textual devolve zero, e sobra só a semântica.
 */
const REFORMULATION_PROMPT = (query: string) =>
	`Você é especialista na legislação aeronáutica brasileira e na administração da Aeronáutica (RADA-e, RBHA, ICA, MCA, NSCA).
A consulta "${query}" não trouxe nenhum trecho do corpus.

Reformule para melhorar o recall, seguindo estas regras:
- SIGLA: escreva a forma POR EXTENSO ("TTAC" → "Termo de Transmissão e Assunção de Cargo").
  É o extenso que aparece no texto da norma que define a sigla.
- Corte palavra interrogativa e de ligação ("o que é", "como faço", "qual", "preciso saber").
  A busca textual exige TODOS os termos no MESMO trecho: cada palavra que a norma não usa
  é um trecho a menos que casa.
- Use o vocabulário da norma (ex: "chefe" → "Agente da Administração"; "piloto" → "comandante").
- Não invente termo que não exista na legislação.

Retorne APENAS a consulta reformulada, sem aspas e sem explicação.`

/**
 * O ChatRADA responde sobre legislação aeronáutica, e `alpha.document` também
 * guarda a Lei 14.133 e os modelos da AGU. Sem este filtro a pergunta sobre o
 * RADA volta com trecho de norma de contratação — e o usuário não tem como
 * perceber, porque a interface lista a fonte pelo id do chunk.
 */
export const RADA_CORPUS_FILTER = { document_type: AERONAUTICAL_DOCUMENT_TYPES } as const

async function reformulate(query: string): Promise<string> {
	return (await invokeText([{ role: "user", content: REFORMULATION_PROMPT(query) }])).trim()
}

/**
 * `undefined` quando não houve reformulação utilizável — o modelo caiu, ou devolveu vazio.
 * Reformular é melhoria de recall, não requisito de correção: sua falha encerra a busca e
 * deixa o turno seguir para a resposta de contingência, em vez de derrubar o turno.
 */
async function reformulateOrGiveUp(query: string): Promise<string | undefined> {
	try {
		return (await reformulate(query)) || undefined
	} catch (error) {
		console.warn(`[rada_agent] reformulação indisponível, encerrando a busca: ${error instanceof Error ? error.message : String(error)}`)
		return undefined
	}
}

export async function radaAgentNode(state: AgentState): Promise<Partial<AgentState>> {
	const iterations = state.retrieval_iterations

	// `search_query` é a pergunta já resolvida contra o histórico pelo pré-passe; a crua é o
	// piso, para quando o pré-passe falhou ou não havia o que resolver.
	const contextualQuery = state.search_query || state.original_query
	const query = iterations === 0 ? contextualQuery : (state.reformulated_query ?? contextualQuery)

	let result: RADARetrieverOutput
	try {
		result = await radaRetriever({ query, filters: RADA_CORPUS_FILTER })
	} catch (error) {
		// O erro era engolido por um `catch {}` vazio. Queda da RPC de busca é indistinguível
		// de "o RADA-e não trata do assunto" pela resposta do usuário, e sem esta linha não
		// havia NENHUM lugar onde a diferença aparecesse.
		console.error(`[rada_agent] busca indisponível: ${error instanceof Error ? error.message : String(error)}`)
		return {
			has_sufficient_context: false,
			retrieval_iterations: iterations + 1,
			// `unavailable`, e não `empty`: este turno NÃO pode terminar no chat geral, que
			// responderia de memória do modelo uma pergunta sobre o regulamento.
			//
			// E aqui NÃO se marca `retrieval_halted`, de propósito: queda de RPC ou de rede
			// pode ser transitória, e repetir a chamada é a forma normal de sobreviver a ela.
			// O que não se repete é a MESMA consulta contra uma busca que funcionou e voltou
			// vazia — essa é determinística, e é esse caso que `retrieval_halted` encerra.
			retrieval_outcome: "unavailable",
			termination_reason: "retrieval_unavailable",
		}
	}

	const newIterations = iterations + 1

	// Perna semântica ligada e caída, sem nenhum documento no fim: metade da busca não
	// rodou. O `radaRetriever` NÃO lança nesse caso — ele degrada para keyword-only de
	// propósito, para não derrubar a recuperação inteira —, então sem esta leitura o turno
	// virava `empty` e ia responder de memória do modelo. Foi exatamente o incidente que o
	// α teve com a task role sem permissão de invocar o embedding.
	const searchWasPartial = result.after_threshold === 0 && result.search_metadata.semantic_unavailable

	if (result.after_threshold >= 1) {
		return {
			retrieved_documents: result.documents,
			has_sufficient_context: true,
			retrieval_iterations: newIterations,
			retrieval_outcome: "found",
		}
	}

	// Reformular na passagem que ESGOTA o orçamento seria uma chamada de modelo cujo
	// resultado ninguém lê — o próximo nó é o chat geral, que responde da pergunta
	// original. Pior: ela ficava fora do `try`, então uma falha do Bedrock derrubava o
	// turno inteiro justamente quando a resposta de contingência já estava garantida.
	const shouldReformulate = newIterations < retrievalBudget(state.intent)
	const nextQuery = shouldReformulate ? await reformulateOrGiveUp(query) : undefined

	return {
		retrieved_documents: [],
		has_sufficient_context: false,
		retrieval_iterations: newIterations,
		retrieval_outcome: searchWasPartial ? "unavailable" : "empty",
		// Reformulação indisponível encerra o laço em vez de repetir a MESMA consulta: a
		// temperatura é 0 e a busca é determinística, então a repetição devolveria os mesmos
		// zero documentos. Sinal próprio, e não `retrieval_iterations` inflado: o contador é
		// telemetria, e uma tentativa registrada como três esconde exatamente esta falha.
		...(shouldReformulate && !nextQuery ? { retrieval_halted: true } : {}),
		...(nextQuery ? { reformulated_query: nextQuery } : {}),
		// Vale só para ESTE turno: `buildTurnInput` não consegue zerar `termination_reason`
		// (o LangGraph ignora `undefined` no input), e quem diz ao chat geral que a busca
		// aconteceu e voltou vazia é `retrieval_outcome`, não este campo.
		termination_reason: "no_documents_found",
	}
}
