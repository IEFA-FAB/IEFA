/**
 * @module journal-data.fn
 * Server functions para operações de dados do journal.
 * Cobre user profiles, articles, authors, versions, reviews, notifications e settings.
 * Todas usam service role (RLS bypass) — nunca importe em código client-side.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
	assertRoleChangeAllowed,
	forbidden,
	getRequestUserId,
	isEditor,
	requireArticleAccess,
	requireArticleOwnerOrEditor,
	requireEditor,
	requireSelf,
	requireUserId,
} from "@/lib/auth.server"
import { sendJournalEmail } from "@/lib/journal/email.server"
import { getJournalServerClient } from "@/lib/supabase.server"

const looseRecord = z.record(z.string(), z.unknown())

// ─── Server-side auth helpers ─────────────────────────────────────────────────
// Server functions são endpoints HTTP crus: o `beforeLoad` das rotas NÃO os
// protege. Como usamos o client service-role (bypassa RLS), CADA fn precisa validar
// o chamador aqui, no servidor, a partir do cookie de sessão. Os guards genéricos
// (requireUserId/requireEditor/requireSelf/…) vivem em @/lib/auth.server; os
// específicos do fluxo editorial ficam abaixo.

// Garante que o chamador é o revisor designado do assignment (dono do parecer).
async function requireAssignedReviewer(assignmentId: string): Promise<void> {
	const userId = await requireUserId()
	const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id").eq("id", assignmentId).maybeSingle()
	if (!assignment || assignment.reviewer_id !== userId) forbidden("Você não é o revisor designado deste parecer.")
}

// Leitura de dados do assignment: permitida ao revisor designado ou a editores.
// (Endpoints service-role bypassam RLS; sem isso qualquer autenticado leria o
// parecer/abstract de outro revisor — quebra do duplo-cego.)
async function requireAssignmentAccess(assignmentId: string): Promise<void> {
	const userId = await requireUserId()
	const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id").eq("id", assignmentId).maybeSingle()
	if (!assignment) throw new Error("Convite de revisão não encontrado.")
	if (assignment.reviewer_id === userId) return
	if (await isEditor(userId)) return
	forbidden("Você não tem acesso a este parecer.")
}

// ─── User Profiles ────────────────────────────────────────────────────────────

// Perfil de qualquer usuário do journal (nome/afiliação aparecem como autoria), mas
// só para quem tem sessão — sem isso o endpoint era um diretório de pesquisadores
// aberto para raspagem anônima. Ler o perfil de OUTRO usuário é intencional (autoria
// aparece nas páginas do journal), então aqui a barreira é sessão, não escopo.
// nosemgrep: server-fn-user-id-from-client
export const getUserProfileFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		await requireUserId()
		const { data: result, error } = await getJournalServerClient().from("user_profiles").select("*").eq("id", data.userId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

// `id` vem da sessão: um perfil só pode ser criado para si mesmo, e `role` só entra
// no payload se quem chama for editor (senão é auto-promoção a editor).
export const createUserProfileFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		await assertRoleChangeAllowed(data)
		const { data: result, error } = await getJournalServerClient()
			.from("user_profiles")
			.insert({ ...data, id: userId })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// O escopo é conferido no corpo: alvo ≠ sessão exige papel de editor, e `role` no
// payload passa por assertRoleChangeAllowed.
// nosemgrep: server-fn-user-id-from-client
export const updateUserProfileFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		// Editor edita qualquer perfil (moderação/atribuição de papel); os demais, só o próprio.
		const userId = await requireUserId()
		if (data.userId !== userId && !(await isEditor(userId))) forbidden("Você só pode editar o próprio perfil.")
		await assertRoleChangeAllowed(data.updates)
		const { data: result, error } = await getJournalServerClient().from("user_profiles").update(data.updates).eq("id", data.userId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const upsertUserProfileFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		await assertRoleChangeAllowed(data)
		const { data: result, error } = await getJournalServerClient()
			.from("user_profiles")
			.upsert({ ...data, id: userId })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Articles ─────────────────────────────────────────────────────────────────

export const getArticlesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			status: z.string().optional(),
			submitter_id: z.string().optional(),
			limit: z.number().optional(),
		})
	)
	.handler(async ({ data }) => {
		// Não-editor só enxerga as próprias submissões: o filtro `submitter_id` é
		// FORÇADO para o id da sessão, não apenas validado. Sem isso, omitir o filtro
		// listava todos os manuscritos não publicados da revista.
		const userId = await requireUserId()
		const callerIsEditor = await isEditor(userId)

		let query = getJournalServerClient().from("articles").select("*")
		if (data.status) query = query.eq("status", data.status)
		query = callerIsEditor && data.submitter_id ? query.eq("submitter_id", data.submitter_id) : query
		if (!callerIsEditor) query = query.eq("submitter_id", userId)
		if (data.limit) query = query.limit(data.limit)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Editor, autor, revisor designado ou artigo publicado — mesma regra do detalhe.
		await requireArticleAccess(data.articleId)
		const { data: result, error } = await getJournalServerClient().from("articles").select("*").eq("id", data.articleId).single()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleWithDetailsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Server fn = endpoint HTTP cru (o `beforeLoad` da rota não protege) e o
		// client é service-role (bypassa RLS). Sem este gate, qualquer UUID de
		// artigo retornaria metadados completos a qualquer chamador (IDOR).
		const { isEditor: callerIsEditor } = await requireArticleAccess(data.articleId)

		// A função vive no schema `journal` (journal.get_article_details), então
		// precisa do client com schema journal — o client "public" resolve para
		// public.get_article_details, que não existe (PGRST202).
		const { data: result, error } = await getJournalServerClient().rpc("get_article_details", {
			article_uuid: data.articleId,
		})
		if (error) throw new Error(error.message)

		// `reviews` embute `comments_for_editors` + a identidade do revisor
		// (assignment.reviewer_id): dados confidenciais ao corpo editorial. Expor
		// isso no payload que chega ao autor quebra o duplo-cego, mesmo que a UI
		// não renderize. Só editores recebem `reviews`; o autor lê os pareceres
		// liberados via getAuthorArticleReviewsFn (apenas campos seguros).
		if (callerIsEditor) return result
		// `typeof [] === "object"` é true: sem o guard de array, um payload em set
		// (RETURNS SETOF / wrapper do client) escaparia a redação silenciosamente.
		if (result && typeof result === "object" && !Array.isArray(result)) {
			const clone = { ...(result as Record<string, unknown>) }
			delete clone.reviews
			return clone
		}
		return result
	})

export const getUserActiveDraftFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		await requireSelf(data.userId)
		const db = getJournalServerClient()
		const { data: article, error } = await db
			.from("articles")
			.select("*")
			.eq("submitter_id", data.userId)
			.eq("status", "draft")
			.is("deleted_at", null)
			.order("updated_at", { ascending: false })
			.limit(1)
			.maybeSingle()
		if (error) throw new Error(error.message)
		if (!article) return null
		const { data: authors, error: authorsError } = await db
			.from("article_authors")
			.select("*")
			.eq("article_id", article.id)
			.order("author_order", { ascending: true })
		if (authorsError) throw new Error(authorsError.message)
		const { data: version } = await db
			.from("article_versions")
			.select("*")
			.eq("article_id", article.id)
			.order("version_number", { ascending: false })
			.limit(1)
			.maybeSingle()
		return { article, authors: authors ?? [], version: version ?? null }
	})

// `submitter_id` vem da sessão: o autor de uma submissão não é escolhido pelo cliente.
export const createArticleFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { data: result, error } = await getJournalServerClient()
			.from("articles")
			.insert({ ...data, submitter_id: userId })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateArticleFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		await requireArticleOwnerOrEditor(data.articleId)
		const { data: result, error } = await getJournalServerClient().from("articles").update(data.updates).eq("id", data.articleId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		await requireArticleOwnerOrEditor(data.articleId)
		const { data: result, error } = await getJournalServerClient()
			.from("articles")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.articleId)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

export const createSubmissionFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const db = getJournalServerClient()
		const year = new Date().getFullYear()
		const { count } = await db.from("articles").select("*", { count: "exact", head: true }).gte("created_at", `${year}-01-01`)
		const submissionNumber = `${year}-${String((count || 0) + 1).padStart(3, "0")}`
		const { data: result, error } = await db
			.from("articles")
			.insert({ ...data, submitter_id: userId, submission_number: submissionNumber, status: "submitted", submitted_at: new Date().toISOString() })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Article Authors ──────────────────────────────────────────────────────────

export const getArticleAuthorsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		await requireArticleAccess(data.articleId)
		const { data: result, error } = await getJournalServerClient()
			.from("article_authors")
			.select("*")
			.eq("article_id", data.articleId)
			.order("author_order", { ascending: true })
		if (error) throw new Error(error.message)
		return result
	})

/**
 * A autorização é por ARTIGO, não por linha de autor. O payload é um array livre, então
 * cada `article_id` citado tem de pertencer ao chamador (ou ele ser editor) — senão
 * bastava inserir com o article_id alheio para se declarar coautor de qualquer manuscrito.
 */
export const createArticleAuthorsFn = createServerFn({ method: "POST" })
	.validator(z.array(looseRecord))
	.handler(async ({ data }) => {
		const articleIds = [...new Set(data.map((row) => row.article_id).filter((id): id is string => typeof id === "string"))]
		if (articleIds.length === 0) forbidden("article_id é obrigatório em cada autor.")
		for (const articleId of articleIds) await requireArticleOwnerOrEditor(articleId)

		const { data: result, error } = await getJournalServerClient().from("article_authors").insert(data).select()
		if (error) throw new Error(error.message)
		return result
	})

/** Resolve o artigo dono da linha de autor para autorizar pelo artigo. */
async function requireAuthorRowAccess(authorId: string): Promise<void> {
	const { data: row } = await getJournalServerClient().from("article_authors").select("article_id").eq("id", authorId).maybeSingle()
	if (!row?.article_id) forbidden("Autor não encontrado.")
	await requireArticleOwnerOrEditor(row.article_id as string)
}

export const updateArticleAuthorFn = createServerFn({ method: "POST" })
	.validator(z.object({ authorId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		await requireAuthorRowAccess(data.authorId)
		const { data: result, error } = await getJournalServerClient().from("article_authors").update(data.updates).eq("id", data.authorId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleAuthorFn = createServerFn({ method: "POST" })
	.validator(z.object({ authorId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuthorRowAccess(data.authorId)
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("id", data.authorId)
		if (error) throw new Error(error.message)
	})

export const deleteArticleAuthorsByArticleIdFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		await requireArticleOwnerOrEditor(data.articleId)
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("article_id", data.articleId)
		if (error) throw new Error(error.message)
	})

// ─── Article Versions ─────────────────────────────────────────────────────────

export const getArticleVersionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Versões apontam para o PDF do manuscrito — mesma regra de acesso do artigo.
		await requireArticleAccess(data.articleId)
		const { data: result, error } = await getJournalServerClient()
			.from("article_versions")
			.select("*")
			.eq("article_id", data.articleId)
			.order("version_number", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const createArticleVersionFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const articleId = typeof data.article_id === "string" ? data.article_id : null
		if (!articleId) forbidden("article_id é obrigatório.")
		await requireArticleOwnerOrEditor(articleId)
		const { data: result, error } = await getJournalServerClient().from("article_versions").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const getLatestArticleVersionFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		await requireArticleAccess(data.articleId)
		const { data: result, error } = await getJournalServerClient()
			.from("article_versions")
			.select("*")
			.eq("article_id", data.articleId)
			.order("version_number", { ascending: false })
			.limit(1)
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Published Articles ───────────────────────────────────────────────────────

/**
 * Acervo publicado — a razão de existir da revista é ser lida sem login.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getPublishedArticlesFn = createServerFn({ method: "GET" })
	.validator(z.object({ limit: z.number().optional(), offset: z.number().optional() }))
	.handler(async ({ data }) => {
		let query = getJournalServerClient().from("published_articles").select("*")
		if (data.limit) query = query.limit(data.limit)
		if (data.offset) query = query.range(data.offset, data.offset + (data.limit ?? 10) - 1)
		const { data: result, error } = await query.order("published_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

/**
 * Artigo publicado, leitura pública — ver `getPublishedArticlesFn`.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getPublishedArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("published_articles").select("*").eq("id", data.articleId).single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Editorial Dashboard ──────────────────────────────────────────────────────

export const getEditorialDashboardFn = createServerFn({ method: "GET" })
	.validator(z.object({ status: z.string().optional(), limit: z.number().optional() }))
	.handler(async ({ data }) => {
		// Fila editorial completa: submissões não publicadas, status e contagem de pareceres.
		await requireEditor()
		let query = getJournalServerClient().from("editorial_dashboard").select("*")
		if (data.status) query = query.eq("status", data.status)
		if (data.limit) query = query.limit(data.limit)
		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result
	})

// ─── Review Assignments ───────────────────────────────────────────────────────

export const getReviewAssignmentsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			article_id: z.string().optional(),
			reviewer_id: z.string().optional(),
			status: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		// Quem designou quem é informação editorial (duplo-cego). Não-editor só vê os
		// próprios convites — o filtro `reviewer_id` é forçado para o id da sessão.
		const userId = await requireUserId()
		const callerIsEditor = await isEditor(userId)

		let query = getJournalServerClient().from("review_assignments").select("*")
		if (data.article_id) query = query.eq("article_id", data.article_id)
		query = callerIsEditor && data.reviewer_id ? query.eq("reviewer_id", data.reviewer_id) : query
		if (!callerIsEditor) query = query.eq("reviewer_id", userId)
		if (data.status) query = query.eq("status", data.status)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

/**
 * Sem sessão de propósito: o `invitation_token` É a credencial. O convite chega por
 * e-mail e o revisor abre o link antes de ter conta — exigir login aqui quebraria o
 * fluxo. O token é aleatório, de uso único por convite, e não vaza nada além do próprio
 * convite.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getReviewAssignmentByTokenFn = createServerFn({ method: "GET" })
	.validator(z.object({ token: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").select("*").eq("invitation_token", data.token).single()
		if (error) throw new Error(error.message)
		return result
	})

// Designar revisor é ato editorial — e `invited_by` vem da sessão.
export const createReviewAssignmentFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const editorId = await requireEditor()
		const { data: result, error } = await getJournalServerClient()
			.from("review_assignments")
			.insert({ ...data, invited_by: editorId })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewAssignmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ assignmentId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		await requireEditor()
		const { data: result, error } = await getJournalServerClient().from("review_assignments").update(data.updates).eq("id", data.assignmentId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

/**
 * Token-autenticada, como `getReviewAssignmentByTokenFn`: aceitar/recusar acontece a
 * partir do link do e-mail, antes de qualquer login.
 */
// nosemgrep: server-fn-missing-auth-guard
export const acceptReviewInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ token: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
			.from("review_assignments")
			.update({ status: "accepted", responded_at: new Date().toISOString() })
			.eq("invitation_token", data.token)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

/**
 * Token-autenticada — ver `acceptReviewInvitationFn`.
 */
// nosemgrep: server-fn-missing-auth-guard
export const declineReviewInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ token: z.string(), reason: z.string().optional() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
			.from("review_assignments")
			.update({
				status: "declined",
				responded_at: new Date().toISOString(),
				decline_reason: data.reason ?? null,
			})
			.eq("invitation_token", data.token)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const getReviewFn = createServerFn({ method: "GET" })
	.validator(z.object({ assignmentId: z.string() }))
	.handler(async ({ data }) => {
		await requireAssignmentAccess(data.assignmentId)
		// maybeSingle: um assignment ainda sem parecer retorna null (não é erro).
		// `.single()` lançava PGRST116 e quebrava o formulário de revisão em branco.
		const { data: result, error } = await getJournalServerClient().from("reviews").select("*").eq("assignment_id", data.assignmentId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleReviewsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Contém comentários confidenciais ao editor + identidade do revisor — só editor.
		await requireEditor()
		// Editor vê os pareceres já submetidos (is_draft = false) do artigo,
		// com dados do assignment (revisor/e-mail/prazo) para identificação.
		const { data: result, error } = await getJournalServerClient()
			.from("reviews")
			.select("*, assignment:review_assignments!inner(id, article_id, reviewer_id, invitation_email, status, due_date)")
			.eq("assignment.article_id", data.articleId)
			.eq("is_draft", false)
			.order("submitted_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

/**
 * Escrita direta na tabela de pareceres. O caminho normal do revisor é
 * `submitReviewFn`/`saveReviewDraftFn`, que validam o assignment; estas duas são a
 * porta genérica e ficam restritas ao revisor designado do assignment informado.
 */
export const createReviewFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const assignmentId = typeof data.assignment_id === "string" ? data.assignment_id : null
		if (!assignmentId) forbidden("assignment_id é obrigatório.")
		await requireAssignedReviewer(assignmentId)
		const { data: result, error } = await getJournalServerClient().from("reviews").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewFn = createServerFn({ method: "POST" })
	.validator(z.object({ reviewId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: row } = await getJournalServerClient().from("reviews").select("assignment_id").eq("id", data.reviewId).maybeSingle()
		if (!row?.assignment_id) forbidden("Parecer não encontrado.")
		await requireAssignedReviewer(row.assignment_id as string)
		const { data: result, error } = await getJournalServerClient().from("reviews").update(data.updates).eq("id", data.reviewId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

// Grava a review do assignment (update se já existir, insert caso contrário).
// reviews.assignment_id não é UNIQUE, então upsert por PK duplicaria linhas — daí o select-then-write.
async function writeReview(assignmentId: string, fields: Record<string, unknown>) {
	const db = getJournalServerClient()
	const { data: existing } = await db.from("reviews").select("id").eq("assignment_id", assignmentId).maybeSingle()
	const query = existing ? db.from("reviews").update(fields).eq("id", existing.id) : db.from("reviews").insert({ assignment_id: assignmentId, ...fields })
	const { data: review, error } = await query.select().single()
	if (error) throw new Error(error.message)
	return review
}

export const submitReviewFn = createServerFn({ method: "POST" })
	.validator(z.object({ assignmentId: z.string(), reviewData: looseRecord }))
	.handler(async ({ data }) => {
		await requireAssignedReviewer(data.assignmentId)
		const db = getJournalServerClient()
		const review = await writeReview(data.assignmentId, { ...data.reviewData, is_draft: false, submitted_at: new Date().toISOString() })

		const { data: assignment, error: assignmentError } = await db
			.from("review_assignments")
			.update({ status: "completed", completed_at: new Date().toISOString() })
			.eq("id", data.assignmentId)
			.select("article_id, reviewer_id")
			.single()
		if (assignmentError) throw new Error(assignmentError.message)

		// Avança o artigo para "under_review" ao receber o primeiro parecer
		// (quando ainda está apenas "submitted"). O status de decisão final
		// continua sendo do editor.
		await db.from("articles").update({ status: "under_review" }).eq("id", assignment.article_id).eq("status", "submitted")

		// Log de evento para a timeline do editor (o trigger de status só cobre mudanças de status).
		await db.from("article_events").insert({
			article_id: assignment.article_id,
			user_id: assignment.reviewer_id,
			event_type: "review_completed",
			event_data: { recommendation: (data.reviewData as { recommendation?: string }).recommendation ?? null },
		})

		return review
	})

// Salva rascunho (is_draft) sem completar o assignment — pode ser chamado várias vezes.
export const saveReviewDraftFn = createServerFn({ method: "POST" })
	.validator(z.object({ assignmentId: z.string(), reviewData: looseRecord }))
	.handler(async ({ data }) => {
		await requireAssignedReviewer(data.assignmentId)
		return writeReview(data.assignmentId, { ...data.reviewData, is_draft: true })
	})

// ─── Notifications ────────────────────────────────────────────────────────────

export const getUserNotificationsFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string(), unreadOnly: z.boolean().optional() }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		let query = getJournalServerClient().from("notifications").select("*").eq("user_id", userId)
		if (data.unreadOnly) query = query.eq("read", false)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const markNotificationAsReadFn = createServerFn({ method: "POST" })
	.validator(z.object({ notificationId: z.string() }))
	.handler(async ({ data }) => {
		// O `eq("user_id")` no UPDATE é a autorização: sem ele, um id de notificação
		// alheio seria marcado como lida por qualquer um.
		const userId = await requireUserId()
		const { data: result, error } = await getJournalServerClient()
			.from("notifications")
			.update({ read: true, read_at: new Date().toISOString() })
			.eq("id", data.notificationId)
			.eq("user_id", userId)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Journal Settings ─────────────────────────────────────────────────────────

/**
 * Configuração pública da revista (escopo, normas, prazos) — renderizada nas páginas
 * abertas do journal, antes de qualquer login.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getJournalSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getJournalServerClient().from("journal_settings").select("*").limit(1).single()
	if (error) throw new Error(error.message)
	return data
})

export const updateJournalSettingsFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		// Inclui min_reviewers_required, que é o piso da decisão editorial de aceite.
		await requireEditor()
		const db = getJournalServerClient()
		const { data: settings, error: fetchError } = await db.from("journal_settings").select("id").limit(1).single()
		if (fetchError) throw new Error(fetchError.message)
		const { data: result, error } = await db.from("journal_settings").update(data).eq("id", settings.id).select().single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Draft helpers (usados por submission.ts) ─────────────────────────────────

export const loadDraftFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		await requireArticleAccess(data.articleId)
		const db = getJournalServerClient()
		const { data: article, error: articleError } = await db.from("articles").select("*").eq("id", data.articleId).single()
		if (articleError) throw new Error(articleError.message)
		const { data: authors, error: authorsError } = await db
			.from("article_authors")
			.select("*")
			.eq("article_id", data.articleId)
			.order("author_order", { ascending: true })
		if (authorsError) throw new Error(authorsError.message)
		return { article, authors: authors ?? [] }
	})

// Um check de permissão avaliado sobre um `userId` escolhido pelo cliente responde
// "pode?" sobre outra pessoa. O id vem da sessão — o do payload é só conferido.
export const canEditArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { data: article } = await getJournalServerClient().from("articles").select("submitter_id, status").eq("id", data.articleId).single()
		if (!article) return false
		return article.submitter_id === userId && (article.status === "draft" || article.status === "revision_requested")
	})

// `user_id` do evento vem da sessão: a timeline editorial é registro de auditoria, e
// um autor de evento escolhido pelo cliente permite forjar quem fez o quê.
export const createArticleEventFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			articleId: z.string(),
			userId: z.string(),
			eventType: z.string(),
			eventData: looseRecord.optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireArticleOwnerOrEditor(data.articleId)
		const { error } = await getJournalServerClient()
			.from("article_events")
			.insert({
				article_id: data.articleId,
				user_id: userId,
				event_type: data.eventType,
				event_data: data.eventData ?? {},
			})
		if (error) throw new Error(error.message)
	})

// ─── Permission checks (usados por auth.ts) ───────────────────────────────────

// Login opcional: artigo publicado responde `true` para anônimo. Para o resto, o
// userId considerado é o da SESSÃO — o do payload é ignorado.
// nosemgrep: server-fn-missing-auth-guard
export const canViewArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string(), userId: z.string().optional() }))
	.handler(async ({ data }) => {
		const db = getJournalServerClient()
		const { data: article } = await db.from("articles").select("status, submitter_id, deleted_at").eq("id", data.articleId).single()
		if (!article) return false
		if (article.status === "published" && !article.deleted_at) return true
		const userId = await getRequestUserId()
		if (!userId) return false
		if (article.submitter_id === userId) return true
		const { data: assignment } = await db
			.from("review_assignments")
			.select("id")
			.eq("article_id", data.articleId)
			.eq("reviewer_id", userId)
			.in("status", ["accepted", "completed"])
			.maybeSingle()
		return !!assignment
	})

export const canSubmitReviewFn = createServerFn({ method: "GET" })
	.validator(z.object({ assignmentId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id, status").eq("id", data.assignmentId).single()
		if (!assignment) return false
		return assignment.reviewer_id === userId && assignment.status === "accepted"
	})

// ─── Reviewer directory + convites (lado do editor) ───────────────────────────

// Lista candidatos a revisor (role reviewer ou editor) com e-mail resolvido de auth.users.
// Expõe e-mails (PII) — restrito a editores.
export const getReviewersFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireEditor()
	const db = getJournalServerClient()
	const { data: profiles, error } = await db
		.from("user_profiles")
		.select("id, full_name, affiliation, expertise, role")
		.in("role", ["reviewer", "editor"])
		.order("full_name", { ascending: true })
	if (error) throw new Error(error.message)

	// E-mail vive em auth.users — resolve por id via admin API (service role).
	// getUserById por revisor evita o teto de paginação do listUsers (o projeto
	// tem >1000 usuários, então listUsers perderia revisores fora da 1ª página).
	const withEmail = await Promise.all(
		(profiles ?? []).map(async (p) => {
			const { data: user } = await db.auth.admin.getUserById(p.id)
			return { ...p, email: user?.user?.email ?? "" }
		})
	)
	return withEmail
})

// Cria o convite de revisão: resolve e-mail, insere o assignment, notifica o revisor,
// avança o artigo para under_review e registra o evento. Encapsula tudo no servidor.
export const inviteReviewerFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			articleId: z.string(),
			reviewerId: z.string(),
			dueDate: z.string(),
		})
	)
	.handler(async ({ data }) => {
		// Autorização server-side: só editor convida. invited_by vem da sessão,
		// nunca do cliente.
		const editorId = await requireEditor()
		const db = getJournalServerClient()

		const { data: reviewerUser, error: userError } = await db.auth.admin.getUserById(data.reviewerId)
		if (userError) throw new Error(userError.message)
		const email = reviewerUser?.user?.email
		if (!email) throw new Error("Revisor não possui e-mail cadastrado.")

		// Conflito de interesse: o revisor não pode ser autor do próprio artigo
		// (submitter ou coautor, por id ou por e-mail).
		const { data: articleRow } = await db.from("articles").select("submitter_id").eq("id", data.articleId).single()
		if (articleRow?.submitter_id === data.reviewerId) {
			throw new Error("Conflito de interesse: este usuário é o autor submissor do artigo.")
		}
		const { data: authorRows } = await db.from("article_authors").select("email").eq("article_id", data.articleId)
		const authorEmails = new Set((authorRows ?? []).map((a) => (a.email ?? "").trim().toLowerCase()).filter(Boolean))
		if (authorEmails.has(email.trim().toLowerCase())) {
			throw new Error("Conflito de interesse: este usuário consta como autor do artigo.")
		}

		const { data: assignment, error } = await db
			.from("review_assignments")
			.insert({
				article_id: data.articleId,
				reviewer_id: data.reviewerId,
				invited_by: editorId,
				invitation_email: email,
				status: "invited",
				due_date: data.dueDate,
			})
			.select()
			.single()
		// A atomicidade contra convite duplicado é garantida por índice único
		// parcial (article_id, reviewer_id) WHERE status ativo — ver migration
		// 20260705160000. 23505 = unique_violation.
		if (error) {
			if (error.code === "23505") throw new Error("Este revisor já foi convidado para este artigo.")
			throw new Error(error.message)
		}

		// Avança o artigo para under_review (se ainda submitted).
		await db.from("articles").update({ status: "under_review" }).eq("id", data.articleId).eq("status", "submitted")

		// Notificação in-app + evento (best-effort — não deve derrubar o convite).
		await db
			.from("notifications")
			.insert({
				user_id: data.reviewerId,
				article_id: data.articleId,
				type: "review_invite",
				title: "Novo convite para revisão",
				message: "Você foi convidado para revisar um artigo. Acesse para aceitar ou recusar.",
				action_url: `/journal/review/${assignment.invitation_token}`,
			})
			.then(() => {})
		await db
			.from("article_events")
			.insert({
				article_id: data.articleId,
				user_id: editorId,
				event_type: "reviewer_invited",
				event_data: { reviewer_id: data.reviewerId, invitation_email: email },
			})
			.then(() => {})

		// E-mail de convite (só despacha se houver provider — senão a notificação
		// in-app acima é a entrega).
		await sendJournalEmail({
			to: email,
			template: "review_invitation",
			vars: {
				due_date: new Date(data.dueDate).toLocaleDateString("pt-BR"),
				review_url: `${process.env.PORTAL_PUBLIC_URL ?? ""}/journal/review/${assignment.invitation_token}`,
			},
		})

		return assignment
	})

// ─── Assignments do revisor (dashboard) ───────────────────────────────────────

// Assignments de um revisor com título do artigo embutido, para o painel do revisor.
export const getReviewerAssignmentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ reviewerId: z.string() }))
	.handler(async ({ data }) => {
		// Só o próprio revisor (ou um editor) lê seus assignments.
		const uid = await requireUserId()
		if (uid !== data.reviewerId && !(await isEditor(uid))) forbidden("Você não tem acesso a estes convites.")
		const db = getJournalServerClient()
		// Expira convites vencidos (best-effort) antes de listar — não há cron, então
		// a expiração acontece oportunamente na leitura.
		await db
			.from("review_assignments")
			.update({ status: "expired" })
			.eq("reviewer_id", data.reviewerId)
			.eq("status", "invited")
			.lt("due_date", new Date().toISOString())
		const { data: result, error } = await db
			.from("review_assignments")
			.select("*, article:articles(id, title_pt, title_en, submission_number, abstract_pt)")
			.eq("reviewer_id", data.reviewerId)
			.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

// Um assignment (com artigo) por id — para o formulário de parecer.
export const getReviewAssignmentFn = createServerFn({ method: "GET" })
	.validator(z.object({ assignmentId: z.string() }))
	.handler(async ({ data }) => {
		// Revisor designado ou editor — o abstract embutido não pode vazar.
		await requireAssignmentAccess(data.assignmentId)
		const { data: result, error } = await getJournalServerClient()
			.from("review_assignments")
			.select("*, article:articles(id, title_pt, title_en, submission_number, abstract_pt, abstract_en)")
			.eq("id", data.assignmentId)
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Timeline de eventos do artigo (lado do editor) ───────────────────────────

export const getArticleEventsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Timeline expõe metadados editoriais/identidade de revisores — só editor.
		await requireEditor()
		const { data: result, error } = await getJournalServerClient()
			.from("article_events")
			.select("*")
			.eq("article_id", data.articleId)
			.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

// ─── Decisão editorial ────────────────────────────────────────────────────────

const DECISION_LABELS: Record<string, string> = {
	accepted: "aceito",
	rejected: "rejeitado",
	revision_requested: "revisão solicitada",
}

// Decisão do editor sobre o artigo. Impõe min_reviewers_required ao aceitar,
// registra o evento e notifica o autor (in-app + e-mail).
export const decideArticleFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string(), decision: z.enum(["accepted", "rejected", "revision_requested"]) }))
	.handler(async ({ data }) => {
		await requireEditor()
		const db = getJournalServerClient()

		// Ao aceitar, exige o número mínimo de pareceres concluídos.
		if (data.decision === "accepted") {
			const { data: settings } = await db.from("journal_settings").select("min_reviewers_required").limit(1).maybeSingle()
			const min = settings?.min_reviewers_required ?? 2
			const { count } = await db
				.from("review_assignments")
				.select("id", { count: "exact", head: true })
				.eq("article_id", data.articleId)
				.eq("status", "completed")
			if ((count ?? 0) < min) {
				throw new Error(`São necessários ao menos ${min} parecer(es) concluído(s) para aceitar (atual: ${count ?? 0}).`)
			}
		}

		const { data: article, error } = await db
			.from("articles")
			.update({ status: data.decision })
			.eq("id", data.articleId)
			.select("id, submitter_id, title_pt")
			.single()
		if (error) throw new Error(error.message)

		// Notifica o autor (in-app garantido + e-mail se houver provider).
		const label = DECISION_LABELS[data.decision] ?? data.decision
		await db
			.from("notifications")
			.insert({
				user_id: article.submitter_id,
				article_id: article.id,
				type: "decision_made",
				title: "Decisão editorial sobre sua submissão",
				message: `Sua submissão "${article.title_pt}" teve o status atualizado para: ${label}.`,
				action_url: `/journal/submissions/${article.id}`,
			})
			.then(() => {})

		const { data: submitter } = await db.auth.admin.getUserById(article.submitter_id)
		const submitterEmail = submitter?.user?.email
		if (submitterEmail) {
			await sendJournalEmail({
				to: submitterEmail,
				template: "decision_made",
				vars: {
					article_title: article.title_pt,
					decision: label,
					article_url: `${process.env.PORTAL_PUBLIC_URL ?? ""}/journal/submissions/${article.id}`,
				},
			})
		}

		return article
	})

// ─── Pareceres para o autor (visão restrita) ──────────────────────────────────

const DECISION_STATUSES = new Set(["revision_requested", "revised_submitted", "accepted", "rejected", "published"])

// Retorna os pareceres visíveis ao autor: apenas feedback qualitativo e
// recomendação, SEM identidade do revisor, SEM comentários confidenciais ao
// editor, e somente depois que uma decisão foi tomada.
export const getAuthorArticleReviewsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const db = getJournalServerClient()

		const { data: article } = await db.from("articles").select("submitter_id, status").eq("id", data.articleId).single()
		if (!article || article.submitter_id !== userId) forbidden("Você não tem acesso a este artigo.")
		if (!DECISION_STATUSES.has(article.status)) return { status: article.status, reviews: [] }

		const { data: rows, error } = await db
			.from("reviews")
			.select("id, recommendation, strengths, weaknesses, comments_for_authors, submitted_at, assignment:review_assignments!inner(article_id)")
			.eq("assignment.article_id", data.articleId)
			.eq("is_draft", false)
			.order("submitted_at", { ascending: true })
		if (error) throw new Error(error.message)

		// Reforço em runtime: só campos seguros saem daqui.
		const reviews = (rows ?? []).map((r, i) => ({
			id: r.id,
			label: `Parecer ${i + 1}`,
			recommendation: r.recommendation,
			strengths: r.strengths,
			weaknesses: r.weaknesses,
			comments_for_authors: r.comments_for_authors,
			submitted_at: r.submitted_at,
		}))
		return { status: article.status, reviews }
	})

// ─── Re-submissão de revisão (autor envia nova versão) ────────────────────────

// O autor, com o artigo em revision_requested, envia uma nova versão do manuscrito
// (PDF já subido via signed URL). Cria a versão N+1, move para revised_submitted,
// reabre os assignments concluídos para nova rodada e registra o evento.
export const resubmitRevisionFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string(), pdfPath: z.string(), sourcePath: z.string().optional(), coverLetter: z.string().optional() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const db = getJournalServerClient()

		const { data: article } = await db.from("articles").select("submitter_id, status").eq("id", data.articleId).single()
		if (!article || article.submitter_id !== userId) forbidden("Você não tem acesso a este artigo.")
		if (article.status !== "revision_requested") throw new Error("A submissão não está aguardando revisão do autor.")

		const { data: last } = await db
			.from("article_versions")
			.select("version_number")
			.eq("article_id", data.articleId)
			.order("version_number", { ascending: false })
			.limit(1)
			.maybeSingle()
		const nextVersion = (last?.version_number ?? 1) + 1

		const { data: version, error } = await db
			.from("article_versions")
			.insert({
				article_id: data.articleId,
				version_number: nextVersion,
				version_label: `Revisão ${nextVersion - 1}`,
				pdf_path: data.pdfPath,
				source_path: data.sourcePath ?? null,
			})
			.select()
			.single()
		if (error) throw new Error(error.message)

		await db.from("articles").update({ status: "revised_submitted" }).eq("id", data.articleId)

		await db
			.from("article_events")
			.insert({
				article_id: data.articleId,
				user_id: userId,
				event_type: "revision_submitted",
				event_data: { version_number: nextVersion, cover_letter: data.coverLetter ?? null },
			})
			.then(() => {})

		return version
	})
