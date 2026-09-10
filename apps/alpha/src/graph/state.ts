import type { BaseMessage } from "@langchain/core/messages"
import { Annotation, messagesStateReducer } from "@langchain/langgraph"
import type { DocumentType } from "../lib/corpora.ts"

export type Intent = "LEGISLATION" | "SEFA_SYSTEMS" | "PROCUREMENT" | "GENERAL" | "GREETING" | "UNKNOWN"

export type { AeronauticalDocumentType, DocumentType, FederalLegislationType } from "../lib/corpora.ts"

export type TerminationReason =
	| "success"
	| "no_documents_found"
	/** A busca não pôde ser feita — RPC/embedding fora do ar. Não é "o corpus não tinha". */
	| "retrieval_unavailable"
	| "low_relevance_score"
	| "hallucination_detected"
	| "max_iterations_reached"
	| "max_retries_reached"

export interface DocumentMetadata {
	source: string
	/** `null` quando a linha traz um tipo que o código não conhece. */
	document_type: DocumentType | null
	chapter: string
	article: string
	section?: string
	year: number
	page: number
}

export interface RelevanceScores {
	semantic_score: number
	keyword_score: number
	rerank_score: number
}

export interface RetrievedDocument {
	id: string
	content: string
	metadata: DocumentMetadata
	scores: RelevanceScores
}

export interface GroundingCheck {
	is_grounded: boolean
	ungrounded_claims: string[]
	confidence: number
}

export const AgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => [],
	}),
	session_id: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),
	user_id: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	intent: Annotation<Intent>({
		reducer: (_, next) => next,
		default: () => "UNKNOWN",
	}),
	original_query: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),
	/**
	 * A pergunta como ela vai à BUSCA — resolvida contra o histórico pelo pré-passe.
	 *
	 * Separada de `original_query` porque as duas têm leitores diferentes: o `query_log` e o
	 * sintetizador querem o que o usuário escreveu ("e o prazo?"), e a recuperação precisa
	 * do que aquilo significa na conversa ("prazo para lavrar o TTAC"). Vazia = usar a
	 * pergunta crua, que é o piso de todo caminho de falha.
	 */
	search_query: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),
	/**
	 * `null`, e não `undefined`, porque este canal PRECISA ser zerado a cada turno: o
	 * `query_log` grava a reformulação de todo turno, e o LangGraph ignora chave com
	 * `undefined` no input — a consulta reformulada da pergunta anterior era registrada
	 * como se fosse a desta. `null` é valor definido, então `buildTurnInput` consegue limpá-lo.
	 */
	reformulated_query: Annotation<string | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),
	retrieved_documents: Annotation<RetrievedDocument[]>({
		reducer: (_, next) => next,
		default: () => [],
	}),
	has_sufficient_context: Annotation<boolean>({
		reducer: (_, next) => next,
		default: () => false,
	}),
	/**
	 * O que a busca no corpus produziu NESTE turno. `null` = nem foi consultada.
	 *
	 * Existe como canal próprio porque o estado sobrevive entre turnos da mesma sessão (o
	 * grafo roda sobre checkpointer) e o LangGraph IGNORA chave com `undefined` no input —
	 * ou seja, `termination_reason` não tem como ser zerado no começo do turno. `null` tem:
	 * é valor definido, e `buildTurnInput` o manda.
	 *
	 * `"unavailable"` NÃO é sinônimo de `"empty"`: corpus vazio pode ser respondido pelo
	 * chat geral com ressalva de procedência; busca fora do ar, não — o modelo responderia
	 * de memória uma pergunta sobre o regulamento, com a mesma cara de sempre.
	 */
	retrieval_outcome: Annotation<"found" | "empty" | "unavailable" | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),
	/**
	 * Não adianta continuar o laço de recuperação: a reformulação está indisponível, e
	 * repetir a MESMA consulta contra uma busca determinística devolveria os mesmos zero
	 * documentos. Encerra sem mexer em `retrieval_iterations`, que é telemetria — inflá-lo
	 * faria uma tentativa parecer três.
	 */
	retrieval_halted: Annotation<boolean>({
		reducer: (_, next) => next,
		default: () => false,
	}),
	min_rerank_threshold: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 0.45,
	}),
	grounding_check: Annotation<GroundingCheck | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	generated_response_draft: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	retrieval_iterations: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 0,
	}),
	grading_retries: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 0,
	}),
	termination_reason: Annotation<TerminationReason | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	final_response: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	cited_documents: Annotation<string[]>({
		reducer: (_, next) => next,
		default: () => [],
	}),
})

export type AgentState = typeof AgentStateAnnotation.State
