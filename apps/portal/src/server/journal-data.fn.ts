/**
 * @module journal-data.fn
 * Server functions para operações de dados do journal.
 * Cobre user profiles, articles, authors, versions, reviews, notifications e settings.
 * Todas usam service role (RLS bypass) — nunca importe em código client-side.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getIefaAuthClient, getJournalServerClient } from "@/lib/supabase.server"

const looseRecord = z.record(z.string(), z.unknown())

// ─── Server-side auth helpers ─────────────────────────────────────────────────
// Server functions são endpoints HTTP crus: o `beforeLoad` das rotas NÃO os
// protege. Como usamos o client service-role (bypassa RLS), mutations sensíveis
// precisam validar o chamador aqui, no servidor, a partir do cookie de sessão.

async function getRequestUserId(): Promise<string | null> {
	const {
		data: { user },
	} = await getIefaAuthClient().auth.getUser()
	return user?.id ?? null
}

async function requireEditor(): Promise<string> {
	const userId = await getRequestUserId()
	if (!userId) throw new Error("Não autenticado.")
	const { data: profile } = await getJournalServerClient().from("user_profiles").select("role").eq("id", userId).maybeSingle()
	if (profile?.role !== "editor") throw new Error("Apenas editores podem executar esta ação.")
	return userId
}

// Garante que o chamador é o revisor designado do assignment (dono do parecer).
async function requireAssignedReviewer(assignmentId: string): Promise<void> {
	const userId = await getRequestUserId()
	if (!userId) throw new Error("Não autenticado.")
	const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id").eq("id", assignmentId).maybeSingle()
	if (!assignment || assignment.reviewer_id !== userId) throw new Error("Você não é o revisor designado deste parecer.")
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export const getUserProfileFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").select("*").eq("id", data.userId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const createUserProfileFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateUserProfileFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").update(data.updates).eq("id", data.userId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const upsertUserProfileFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").upsert(data).select().single()
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
		let query = getJournalServerClient().from("articles").select("*")
		if (data.status) query = query.eq("status", data.status)
		if (data.submitter_id) query = query.eq("submitter_id", data.submitter_id)
		if (data.limit) query = query.limit(data.limit)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").select("*").eq("id", data.articleId).single()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleWithDetailsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// A função vive no schema `journal` (journal.get_article_details), então
		// precisa do client com schema journal — o client "public" resolve para
		// public.get_article_details, que não existe (PGRST202).
		const { data: result, error } = await getJournalServerClient().rpc("get_article_details", {
			article_uuid: data.articleId,
		})
		if (error) throw new Error(error.message)
		return result
	})

export const getUserActiveDraftFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
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

export const createArticleFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateArticleFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").update(data.updates).eq("id", data.articleId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
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
		const db = getJournalServerClient()
		const year = new Date().getFullYear()
		const { count } = await db.from("articles").select("*", { count: "exact", head: true }).gte("created_at", `${year}-01-01`)
		const submissionNumber = `${year}-${String((count || 0) + 1).padStart(3, "0")}`
		const { data: result, error } = await db
			.from("articles")
			.insert({ ...data, submission_number: submissionNumber, status: "submitted", submitted_at: new Date().toISOString() })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Article Authors ──────────────────────────────────────────────────────────

export const getArticleAuthorsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
			.from("article_authors")
			.select("*")
			.eq("article_id", data.articleId)
			.order("author_order", { ascending: true })
		if (error) throw new Error(error.message)
		return result
	})

export const createArticleAuthorsFn = createServerFn({ method: "POST" })
	.validator(z.array(looseRecord))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("article_authors").insert(data).select()
		if (error) throw new Error(error.message)
		return result
	})

export const updateArticleAuthorFn = createServerFn({ method: "POST" })
	.validator(z.object({ authorId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("article_authors").update(data.updates).eq("id", data.authorId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleAuthorFn = createServerFn({ method: "POST" })
	.validator(z.object({ authorId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("id", data.authorId)
		if (error) throw new Error(error.message)
	})

export const deleteArticleAuthorsByArticleIdFn = createServerFn({ method: "POST" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("article_id", data.articleId)
		if (error) throw new Error(error.message)
	})

// ─── Article Versions ─────────────────────────────────────────────────────────

export const getArticleVersionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
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
		const { data: result, error } = await getJournalServerClient().from("article_versions").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const getLatestArticleVersionFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
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
		let query = getJournalServerClient().from("review_assignments").select("*")
		if (data.article_id) query = query.eq("article_id", data.article_id)
		if (data.reviewer_id) query = query.eq("reviewer_id", data.reviewer_id)
		if (data.status) query = query.eq("status", data.status)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const getReviewAssignmentByTokenFn = createServerFn({ method: "GET" })
	.validator(z.object({ token: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").select("*").eq("invitation_token", data.token).single()
		if (error) throw new Error(error.message)
		return result
	})

export const createReviewAssignmentFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewAssignmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ assignmentId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").update(data.updates).eq("id", data.assignmentId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

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
		// maybeSingle: um assignment ainda sem parecer retorna null (não é erro).
		// `.single()` lançava PGRST116 e quebrava o formulário de revisão em branco.
		const { data: result, error } = await getJournalServerClient().from("reviews").select("*").eq("assignment_id", data.assignmentId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleReviewsFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
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

export const createReviewFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("reviews").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewFn = createServerFn({ method: "POST" })
	.validator(z.object({ reviewId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
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
		let query = getJournalServerClient().from("notifications").select("*").eq("user_id", data.userId)
		if (data.unreadOnly) query = query.eq("read", false)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const markNotificationAsReadFn = createServerFn({ method: "POST" })
	.validator(z.object({ notificationId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
			.from("notifications")
			.update({ read: true, read_at: new Date().toISOString() })
			.eq("id", data.notificationId)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Journal Settings ─────────────────────────────────────────────────────────

export const getJournalSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getJournalServerClient().from("journal_settings").select("*").limit(1).single()
	if (error) throw new Error(error.message)
	return data
})

export const updateJournalSettingsFn = createServerFn({ method: "POST" })
	.validator(looseRecord)
	.handler(async ({ data }) => {
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

export const canEditArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: article } = await getJournalServerClient().from("articles").select("submitter_id, status").eq("id", data.articleId).single()
		if (!article) return false
		return article.submitter_id === data.userId && (article.status === "draft" || article.status === "revision_requested")
	})

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
		const { error } = await getJournalServerClient()
			.from("article_events")
			.insert({
				article_id: data.articleId,
				user_id: data.userId,
				event_type: data.eventType,
				event_data: data.eventData ?? {},
			})
		if (error) throw new Error(error.message)
	})

// ─── Permission checks (usados por auth.ts) ───────────────────────────────────

export const canViewArticleFn = createServerFn({ method: "GET" })
	.validator(z.object({ articleId: z.string(), userId: z.string().optional() }))
	.handler(async ({ data }) => {
		const db = getJournalServerClient()
		const { data: article } = await db.from("articles").select("status, submitter_id, deleted_at").eq("id", data.articleId).single()
		if (!article) return false
		if (article.status === "published" && !article.deleted_at) return true
		if (!data.userId) return false
		if (article.submitter_id === data.userId) return true
		const { data: assignment } = await db
			.from("review_assignments")
			.select("id")
			.eq("article_id", data.articleId)
			.eq("reviewer_id", data.userId)
			.in("status", ["accepted", "completed"])
			.maybeSingle()
		return !!assignment
	})

export const canSubmitReviewFn = createServerFn({ method: "GET" })
	.validator(z.object({ assignmentId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id, status").eq("id", data.assignmentId).single()
		if (!assignment) return false
		return assignment.reviewer_id === data.userId && assignment.status === "accepted"
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

		return assignment
	})

// ─── Assignments do revisor (dashboard) ───────────────────────────────────────

// Assignments de um revisor com título do artigo embutido, para o painel do revisor.
export const getReviewerAssignmentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ reviewerId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
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
		const { data: result, error } = await getJournalServerClient()
			.from("article_events")
			.select("*")
			.eq("article_id", data.articleId)
			.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})
