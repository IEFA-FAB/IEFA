import type { BaseMessage } from "@langchain/core/messages"
import { Annotation, messagesStateReducer } from "@langchain/langgraph"

export type Intent =
	| "LEGISLATION"
	| "SEFA_SYSTEMS"
	| "PROCUREMENT"
	| "GENERAL"
	| "GREETING"
	| "UNKNOWN"

export type DocumentType = "RADA" | "RBHA" | "ICA" | "MCA" | "NSCA"

export type TerminationReason =
	| "success"
	| "no_documents_found"
	| "low_relevance_score"
	| "hallucination_detected"
	| "max_iterations_reached"
	| "max_retries_reached"

export interface DocumentMetadata {
	source: string
	document_type: DocumentType
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
	reformulated_query: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	retrieved_documents: Annotation<RetrievedDocument[]>({
		reducer: (_, next) => next,
		default: () => [],
	}),
	has_sufficient_context: Annotation<boolean>({
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
