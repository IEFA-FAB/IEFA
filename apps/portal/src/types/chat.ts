export type HealthStatus = "loading" | "ok" | "error"

export type ChatMessage = {
	id: string
	role: "user" | "assistant"
	content: string
	sources?: string[]
	references?: Array<{
		n: number
		source: string
		page?: number
		snippet?: string
		rank?: number
		doc_id?: string
	}>
	error?: boolean
	createdAt: number
}

export type AskReference = {
	n: number
	source: string
	page?: number
	snippet?: string
	rank?: number
	doc_id?: string
}

export type AskResponse = {
	answer: string
	references: AskReference[]
	sources: string[]
	session_id: string
}

export type RemoteMessage = {
	/** Ids de chunk citados na resposta; vazio para mensagem do usuário. */
	cited_documents?: string[]
	role: "user" | "assistant" | "system"
	content: string
	content_json?:
		| {
				type?: "user" | "assistant" | "system"
				question?: string
				answer?: string
				references?: AskReference[]
				sources?: string[]
				content?: string
		  }
		| string
	created_at: string // ISO
}

export type SessionSummary = {
	id: string
	created_at: string // ISO
	last_message_at?: string | null // ISO
	/** Título derivado da conversa pelo α; ausente em registro antigo. */
	title?: string
	message_count?: number
}
