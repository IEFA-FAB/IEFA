/**
 * @module write-schemas
 * O que cada papel pode ESCREVER nas tabelas do journal.
 *
 * As server fns usam o client service-role (bypassa RLS), então o validator é a única
 * barreira sobre QUAIS colunas o chamador escreve. Antes, todas aceitavam um
 * `z.record(z.string(), z.unknown())` e repassavam ao `.insert()`/`.update()`: o autor
 * do próprio artigo mudava `status` para `published`, gravava `doi`/`volume`, trocava o
 * `article_id` de uma linha de autor (e virava coautor de manuscrito alheio), assinava
 * versão em nome de outro (`uploaded_by`) e sobrescrevia `assignment_id` no parecer.
 *
 * Regra: cada operação lista as colunas que aceita; ids que dão autorização (dono,
 * artigo, assignment) vêm da sessão ou do registro já autorizado, nunca do payload.
 * `z.object` descarta chave desconhecida — o que não está listado não chega ao banco.
 *
 * Módulo puro (só zod) para ser testado sem env.
 */

import { z } from "zod"

export const ARTICLE_STATUSES = ["draft", "submitted", "under_review", "revision_requested", "revised_submitted", "accepted", "rejected", "published"] as const

/** Status em que o autor ainda mexe no próprio manuscrito — mesma regra do `canEditArticleFn`. */
export const AUTHOR_EDITABLE_STATUSES = ["draft", "revision_requested"] as const

const articleType = z.enum(["research", "review", "short_communication", "editorial"])
const nullableText = z.string().nullable().optional()

// ─── Artigos ──────────────────────────────────────────────────────────────────

/**
 * Metadados que o AUTOR escreve. Ficam de fora de propósito: `status`, `doi`,
 * `volume`/`issue`/páginas, `published_at`/`submitted_at`, `submission_number`,
 * `submitter_id` e `deleted_at` — cada um tem fluxo próprio no servidor.
 */
export const AuthorArticleFieldsSchema = z.object({
	title_pt: z.string().optional(),
	title_en: z.string().optional(),
	abstract_pt: z.string().optional(),
	abstract_en: z.string().optional(),
	keywords_pt: z.array(z.string()).optional(),
	keywords_en: z.array(z.string()).optional(),
	article_type: articleType.optional(),
	subject_area: z.string().optional(),
	conflict_of_interest: z.string().optional(),
	funding_info: nullableText,
	data_availability: nullableText,
	ethics_approval: nullableText,
})

/** Editor: metadados + fluxo editorial (o Kanban muda `status` por aqui). */
export const EditorArticleUpdateSchema = AuthorArticleFieldsSchema.extend({
	status: z.enum(ARTICLE_STATUSES).optional(),
	doi: nullableText,
	volume: z.number().int().nullable().optional(),
	issue: z.number().int().nullable().optional(),
	page_start: z.number().int().nullable().optional(),
	page_end: z.number().int().nullable().optional(),
	published_at: nullableText,
})

const AUTHOR_ARTICLE_KEYS = new Set(Object.keys(AuthorArticleFieldsSchema.shape))

/** Chaves presentes no update que só o editor pode escrever. Vazio = o autor pode. */
export function editorOnlyArticleKeys(updates: Record<string, unknown>): string[] {
	return Object.keys(updates).filter((key) => updates[key] !== undefined && !AUTHOR_ARTICLE_KEYS.has(key))
}

// ─── Autores do artigo ────────────────────────────────────────────────────────

/** Colunas editáveis de uma linha de autor — sem `article_id`: trocar de artigo não é edição. */
export const ArticleAuthorUpdateSchema = z.object({
	full_name: z.string().min(1).optional(),
	email: nullableText,
	affiliation: nullableText,
	orcid: nullableText,
	is_corresponding: z.boolean().optional(),
	author_order: z.number().int().positive().optional(),
})

export const ArticleAuthorInsertSchema = ArticleAuthorUpdateSchema.extend({
	article_id: z.uuid(),
	full_name: z.string().min(1),
	author_order: z.number().int().positive(),
})

// ─── Versões ──────────────────────────────────────────────────────────────────

/** `uploaded_by` fica de fora: vem da sessão. `notes` é anotação do editor. */
export const ArticleVersionInsertSchema = z.object({
	article_id: z.uuid(),
	version_number: z.number().int().positive().optional(),
	version_label: nullableText,
	pdf_path: z.string().min(1),
	source_path: nullableText,
	supplementary_paths: z.array(z.string().min(1)).nullable().optional(),
	notes: nullableText,
})

// ─── Pareceres ────────────────────────────────────────────────────────────────

const score = z.number().int().min(1).max(5).nullable().optional()

/**
 * Conteúdo do parecer. Sem `assignment_id`, `is_draft` e `submitted_at`: o assignment é o
 * que foi autorizado, e rascunho/submissão é decidido pela fn chamada.
 */
export const ReviewContentSchema = z.object({
	score_originality: score,
	score_methodology: score,
	score_clarity: score,
	score_references: score,
	score_overall: score,
	strengths: nullableText,
	weaknesses: nullableText,
	comments_for_authors: z.string().optional(),
	comments_for_editors: nullableText,
	recommendation: z.enum(["accept", "minor_revision", "major_revision", "reject"]).optional(),
	has_methodology_issues: z.boolean().optional(),
	has_statistical_errors: z.boolean().optional(),
	has_ethical_concerns: z.boolean().optional(),
	suspected_plagiarism: z.boolean().optional(),
})

export const ReviewInsertSchema = ReviewContentSchema.extend({ assignment_id: z.uuid() })

// ─── Designações de revisão (editor) ──────────────────────────────────────────

const reviewStatus = z.enum(["invited", "accepted", "declined", "completed", "expired"])

/** `invited_by` vem da sessão; `invitation_token` é gerado pelo banco. */
export const ReviewAssignmentInsertSchema = z.object({
	article_id: z.uuid(),
	reviewer_id: z.uuid().nullable().optional(),
	invitation_email: z.string().min(3),
	due_date: z.string().min(1),
	status: reviewStatus.optional(),
})

/** Sem `article_id`/`invitation_token`/`invited_by`: mover o convite de artigo não é edição. */
export const ReviewAssignmentUpdateSchema = z.object({
	reviewer_id: z.uuid().nullable().optional(),
	invitation_email: z.string().min(3).optional(),
	status: reviewStatus.optional(),
	due_date: z.string().min(1).optional(),
	responded_at: nullableText,
	completed_at: nullableText,
	decline_reason: nullableText,
	suggested_reviewers: nullableText,
})

// ─── Perfis ───────────────────────────────────────────────────────────────────

/**
 * `id` fica de fora (vem da sessão ou do alvo autorizado). `role` continua aceito, mas
 * passa por `assertRoleChangeAllowed`: só editor altera papel.
 */
export const UserProfileFieldsSchema = z.object({
	full_name: z.string().min(1).optional(),
	affiliation: nullableText,
	orcid: nullableText,
	bio: nullableText,
	expertise: z.array(z.string()).nullable().optional(),
	email_notifications: z.boolean().optional(),
	role: z.enum(["author", "editor", "reviewer"]).optional(),
})

// ─── Configuração da revista (editor) ─────────────────────────────────────────

export const JournalSettingsUpdateSchema = z.object({
	journal_name_pt: z.string().min(1).optional(),
	journal_name_en: z.string().min(1).optional(),
	issn_print: nullableText,
	issn_online: nullableText,
	publisher: z.string().min(1).optional(),
	doi_prefix: nullableText,
	crossref_username: nullableText,
	crossref_password: nullableText,
	crossref_test_mode: z.boolean().optional(),
	default_review_deadline_days: z.number().int().positive().optional(),
	min_reviewers_required: z.number().int().min(1).optional(),
	enable_double_blind: z.boolean().optional(),
	from_email: z.string().min(3).optional(),
	from_name: z.string().min(1).optional(),
})

// ─── Timeline ─────────────────────────────────────────────────────────────────

/**
 * Eventos que um editor registra à mão. Os demais (`submitted`, `status_changed`,
 * `reviewer_invited`, `review_completed`, `revision_submitted`) nascem do fluxo no
 * servidor ou do trigger — aceitar esses nomes do cliente era forjar a timeline.
 */
export const MANUAL_ARTICLE_EVENT_TYPES = ["editor_note", "published"] as const

export const ArticleEventDataSchema = z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))

// ─── Tipos de entrada (client.ts / hooks.ts) ──────────────────────────────────

export type ArticleAuthorInsertInput = z.input<typeof ArticleAuthorInsertSchema>
export type ArticleVersionInsertInput = z.input<typeof ArticleVersionInsertSchema>
export type ReviewAssignmentInsertInput = z.input<typeof ReviewAssignmentInsertSchema>
export type ReviewInsertInput = z.input<typeof ReviewInsertSchema>
