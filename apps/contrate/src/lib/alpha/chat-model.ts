/**
 * Chat sobre documento — tipos e regras de apresentação, sem rede nem sessão.
 *
 * Separado de `chat.ts` (que fala com o α e usa a sessão) para o teste rodar sem env.
 */

import { AlphaRequestError } from "./client"
import { formatDate, formatDateTime } from "./format"

export type ChatKind = "processo" | "avulso"

export interface ChatThread {
	id: string
	submission_id: string | null
	kind: ChatKind
	title: string | null
	saved_at: string | null
	created_at: string
	last_activity_at: string
	/** Quando a conversa avulsa não salva será apagada. `null` = não expira. */
	purge_at: string | null
}

export type Citation =
	| { label: string; kind: "norma"; ref: string; source: string | null }
	| { label: string; kind: "achado"; ref: string; severity: string; message: string }
	| { label: string; kind: "documento"; ref: string; document: string; path: string | null; section_title: string | null; quote?: string; located?: boolean }

export interface ChatMessage {
	id: string
	role: "user" | "assistant"
	content: string
	citations: Citation[]
	status: "complete" | "aborted" | "error"
	created_at: string
}

export interface ChatAttachment {
	id: string
	label: string
	filename: string
	mime_type: string
	size_bytes: number
	text_chars: number
	created_at: string
}

export interface ChatThreadDetail extends ChatThread {
	/** `false` quando o dono perdeu o acesso ao processo: lê o histórico, não pergunta mais. */
	can_continue: boolean
	messages: ChatMessage[]
	attachments: ChatAttachment[]
	max_attachments: number
}

export type ChatPhase = "pensando" | "buscando_norma" | "lendo_secao" | "buscando_no_documento" | "escrevendo"

export const PHASE_LABEL: Record<ChatPhase, string> = {
	pensando: "lendo as fontes…",
	buscando_norma: "buscando na norma…",
	lendo_secao: "lendo a seção do documento…",
	buscando_no_documento: "procurando no documento…",
	escrevendo: "escrevendo…",
}

/** Erro de turno, com o código que a tela traduz em {@link describeChatError}. */
export class ChatTurnError extends Error {
	readonly code: string
	readonly retryAfter: string | null

	constructor(code: string, message: string, retryAfter: string | null = null) {
		super(message)
		this.name = "ChatTurnError"
		this.code = code
		this.retryAfter = retryAfter
	}
}

/** Mensagem legível de um erro do chat — nunca o código cru. */
export function describeChatError(error: unknown): string {
	const code = error instanceof ChatTurnError || error instanceof AlphaRequestError ? error.code : null
	const retryAfter =
		error instanceof ChatTurnError
			? error.retryAfter
			: typeof (error as AlphaRequestError)?.body?.retry_after === "string"
				? String((error as AlphaRequestError).body?.retry_after)
				: null
	switch (code) {
		case "CHAT_DAILY_LIMIT":
			return `Você atingiu o limite diário de perguntas.${retryAfter ? ` O envio volta a ser possível em ${formatDateTime(retryAfter)}.` : ""}`
		case "SUBMISSION_ACCESS_REVOKED":
			return "Você não tem mais acesso a este processo. A conversa continua disponível para leitura."
		case "MODEL_UNAVAILABLE":
			return "O assistente está indisponível no momento. Tente de novo em alguns minutos."
		case "TURN_TIMEOUT":
			return "A resposta demorou demais e foi interrompida. Tente reformular a pergunta de forma mais específica."
		case "SOURCES_UNAVAILABLE":
			return "Não foi possível ler o documento agora. Tente de novo em instantes."
		case "EMPTY_ANSWER":
			return "O assistente não produziu resposta. Tente reformular a pergunta."
		case "CONNECTION_LOST":
			return "A conexão caiu antes do fim da resposta. Envie a pergunta de novo."
		case "CHAT_NOT_FOUND":
			return "Esta conversa não existe mais."
		case "CHAT_ATTACHMENT_LIMIT":
		case "UNSUPPORTED_FORMAT":
		case "FILE_TOO_LARGE":
		case "DOCUMENT_TOO_LARGE":
		case "UNREADABLE_DOCUMENT":
		case "NO_TEXT":
			return error instanceof Error ? error.message : "Arquivo recusado."
		default:
			// Falha de rede (α fora do ar, conexão caída, preflight recusado): o `fetch` lança
			// `TypeError` com a mensagem do navegador em inglês — "Failed to fetch" no Chrome,
			// "NetworkError when attempting to fetch resource." no Firefox.
			if (error instanceof TypeError) return "Não foi possível falar com o assistente. Verifique a conexão e tente de novo."
			return error instanceof Error && error.message ? error.message : "Algo deu errado. Tente de novo."
	}
}

// ─── Texto da resposta ────────────────────────────────────────────────────────

export type AnswerPart = { kind: "markdown"; text: string } | { kind: "redacao"; section: string | null; text: string }

/**
 * Separa a resposta em trechos de texto e blocos de redação sugerida (` ```redacao `).
 * O bloco vira cartão com "Copiar", e o que se copia é SÓ o texto proposto: sem a linha
 * `Seção:` e sem o aviso. Bloco não fechado (resposta ainda chegando) também vira cartão.
 */
export function splitRedaction(content: string): AnswerPart[] {
	const parts: AnswerPart[] = []
	const pattern = /```redacao[^\n]*\n([\s\S]*?)(?:```|$)/g
	let last = 0
	for (const match of content.matchAll(pattern)) {
		const before = content.slice(last, match.index)
		if (before.trim()) parts.push({ kind: "markdown", text: before })
		const body = match[1] ?? ""
		const sectionLine = /^\s*Seção:\s*(.+)\n?/i.exec(body)
		const text = (sectionLine ? body.slice(sectionLine[0].length) : body).replace(/\s+$/, "")
		parts.push({ kind: "redacao", section: sectionLine?.[1]?.trim() ?? null, text })
		last = (match.index ?? 0) + match[0].length
	}
	const tail = content.slice(last)
	if (tail.trim()) parts.push({ kind: "markdown", text: tail })
	return parts
}

/** Rótulos de citação no texto: `[N1]`, `[A2]`, `[D1:3.2]`. */
export const CITATION_LABEL = /\[((?:N|A|D)\d+(?::\d+(?:\.\d+)*)?)\]/g

// ─── Guarda ───────────────────────────────────────────────────────────────────

/** A partir de quantos dias do expurgo o aviso ganha destaque. */
export const PURGE_WARNING_DAYS = 30

export function purgeNotice(thread: Pick<ChatThread, "purge_at">, now: Date = new Date()): { text: string; urgent: boolean } | null {
	if (!thread.purge_at) return null
	const at = new Date(thread.purge_at)
	const days = Math.ceil((at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
	return { text: `será apagada em ${formatDate(thread.purge_at)} se não for usada`, urgent: days <= PURGE_WARNING_DAYS }
}

/** Pergunta pronta do atalho "Perguntar sobre este achado" — vai para o campo, não é enviada. */
export function findingQuestion(finding: { severity: string; section_path: string | null; message: string }): string {
	const where = finding.section_path ? ` na seção ${finding.section_path}` : ""
	return `Explique o achado ${finding.severity}${where}: "${finding.message}". O que a norma exige e como reescrever o trecho para atender?`
}

// ─── Trecho de norma citado ───────────────────────────────────────────────────

/** `GET /api/v1/chunks/:id` do α — o mesmo que o ChatRADA usa para abrir a citação. */
export interface ChunkDetail {
	id: string
	content: string
	chapter: string | null
	article: string | null
	section: string | null
	metadata: { source?: string; document_type?: string } | null
	/** Procedência lida da tabela `document`: o corpus federal não grava `metadata.source`. */
	document?: { id: string; title: string | null; document_type: string | null } | null
}

/** Texto do trecho como se lê na norma — sem a marca `####` que a ingestão põe no dispositivo. */
export function chunkText(chunk: ChunkDetail): string {
	return chunk.content.replace(/^#{1,6}[ \t]+/gm, "")
}

/**
 * Documento e dispositivo do trecho. Sem nome de documento no dado, DECLARA a ausência em vez
 * de supor a origem (a lição do ChatRADA, que carimbava "RADA-e" em trecho da Lei 14.133).
 * Dispositivo é `article` OU `section`: na numeração decimal um contém o outro.
 */
export function chunkLabel(chunk: ChunkDetail): string {
	const documento = chunk.metadata?.source?.trim() || chunk.document?.title?.trim() || "Documento não identificado"
	const dispositivo = chunk.article || chunk.section
	return dispositivo ? `${documento} — ${dispositivo}` : documento
}
