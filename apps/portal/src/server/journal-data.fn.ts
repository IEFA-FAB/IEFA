/**
 * @module journal-data.fn
 * Server functions para operações de dados do journal.
 * Cobre user profiles, articles, authors, versions, reviews, notifications e settings.
 * Todas usam service role (RLS bypass) — nunca importe em código client-side.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getJournalServerClient } from "@/lib/supabase.server"

const looseRecord = z.record(z.unknown())

// ─── User Profiles ────────────────────────────────────────────────────────────

export const getUserProfileFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").select("*").eq("id", data.userId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const createUserProfileFn = createServerFn({ method: "POST" })
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateUserProfileFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").update(data.updates).eq("id", data.userId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const upsertUserProfileFn = createServerFn({ method: "POST" })
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("user_profiles").upsert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Articles ─────────────────────────────────────────────────────────────────

export const getArticlesFn = createServerFn({ method: "GET" })
	.inputValidator(
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
	.inputValidator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").select("*").eq("id", data.articleId).single()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleWithDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		// Usa cliente padrão (sem schema) para chamar RPC na schema pública
		const { createClient } = await import("@supabase/supabase-js")
		const { envServer } = await import("@/lib/env.server")
		const client = createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
			auth: { persistSession: false },
		})
		const { data: result, error } = await client.rpc("get_article_details", {
			article_uuid: data.articleId,
		})
		if (error) throw new Error(error.message)
		return result
	})

export const getUserActiveDraftFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
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
		return { article, authors: authors ?? [] }
	})

export const createArticleFn = createServerFn({ method: "POST" })
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateArticleFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ articleId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("articles").update(data.updates).eq("id", data.articleId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ articleId: z.string() }))
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
	.inputValidator(looseRecord)
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
	.inputValidator(z.object({ articleId: z.string() }))
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
	.inputValidator(z.array(looseRecord))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("article_authors").insert(data).select()
		if (error) throw new Error(error.message)
		return result
	})

export const updateArticleAuthorFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ authorId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("article_authors").update(data.updates).eq("id", data.authorId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const deleteArticleAuthorFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ authorId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("id", data.authorId)
		if (error) throw new Error(error.message)
	})

export const deleteArticleAuthorsByArticleIdFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getJournalServerClient().from("article_authors").delete().eq("article_id", data.articleId)
		if (error) throw new Error(error.message)
	})

// ─── Article Versions ─────────────────────────────────────────────────────────

export const getArticleVersionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ articleId: z.string() }))
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
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("article_versions").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const getLatestArticleVersionFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ articleId: z.string() }))
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
	.inputValidator(z.object({ limit: z.number().optional(), offset: z.number().optional() }))
	.handler(async ({ data }) => {
		let query = getJournalServerClient().from("published_articles").select("*")
		if (data.limit) query = query.limit(data.limit)
		if (data.offset) query = query.range(data.offset, data.offset + (data.limit ?? 10) - 1)
		const { data: result, error } = await query.order("published_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const getPublishedArticleFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("published_articles").select("*").eq("id", data.articleId).single()
		if (error) throw new Error(error.message)
		return result
	})

// ─── Editorial Dashboard ──────────────────────────────────────────────────────

export const getEditorialDashboardFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ status: z.string().optional(), limit: z.number().optional() }))
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
	.inputValidator(
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
	.inputValidator(z.object({ token: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").select("*").eq("invitation_token", data.token).single()
		if (error) throw new Error(error.message)
		return result
	})

export const createReviewAssignmentFn = createServerFn({ method: "POST" })
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewAssignmentFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ assignmentId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("review_assignments").update(data.updates).eq("id", data.assignmentId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const acceptReviewInvitationFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ token: z.string() }))
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
	.inputValidator(z.object({ token: z.string(), reason: z.string().optional() }))
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
	.inputValidator(z.object({ assignmentId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("reviews").select("*").eq("assignment_id", data.assignmentId).single()
		if (error) throw new Error(error.message)
		return result
	})

export const getArticleReviewsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ articleId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient()
			.from("reviews")
			.select("*, assignment:review_assignments!inner(article_id)")
			.eq("assignment.article_id", data.articleId)
		if (error) throw new Error(error.message)
		return result
	})

export const createReviewFn = createServerFn({ method: "POST" })
	.inputValidator(looseRecord)
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("reviews").insert(data).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const updateReviewFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ reviewId: z.string(), updates: looseRecord }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getJournalServerClient().from("reviews").update(data.updates).eq("id", data.reviewId).select().single()
		if (error) throw new Error(error.message)
		return result
	})

export const submitReviewFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ assignmentId: z.string(), reviewData: looseRecord }))
	.handler(async ({ data }) => {
		const db = getJournalServerClient()
		const { data: review, error: reviewError } = await db
			.from("reviews")
			.upsert({ assignment_id: data.assignmentId, ...data.reviewData, submitted_at: new Date().toISOString() })
			.select()
			.single()
		if (reviewError) throw new Error(reviewError.message)
		const { error: assignmentError } = await db
			.from("review_assignments")
			.update({ status: "completed", completed_at: new Date().toISOString() })
			.eq("id", data.assignmentId)
		if (assignmentError) throw new Error(assignmentError.message)
		return review
	})

// ─── Notifications ────────────────────────────────────────────────────────────

export const getUserNotificationsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string(), unreadOnly: z.boolean().optional() }))
	.handler(async ({ data }) => {
		let query = getJournalServerClient().from("notifications").select("*").eq("user_id", data.userId)
		if (data.unreadOnly) query = query.eq("read", false)
		const { data: result, error } = await query.order("created_at", { ascending: false })
		if (error) throw new Error(error.message)
		return result
	})

export const markNotificationAsReadFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ notificationId: z.string() }))
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
	.inputValidator(looseRecord)
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
	.inputValidator(z.object({ articleId: z.string() }))
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
	.inputValidator(z.object({ articleId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: article } = await getJournalServerClient().from("articles").select("submitter_id, status").eq("id", data.articleId).single()
		if (!article) return false
		return article.submitter_id === data.userId && (article.status === "draft" || article.status === "revision_requested")
	})

export const createArticleEventFn = createServerFn({ method: "POST" })
	.inputValidator(
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
	.inputValidator(z.object({ articleId: z.string(), userId: z.string().optional() }))
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
	.inputValidator(z.object({ assignmentId: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: assignment } = await getJournalServerClient().from("review_assignments").select("reviewer_id, status").eq("id", data.assignmentId).single()
		if (!assignment) return false
		return assignment.reviewer_id === data.userId && assignment.status === "accepted"
	})
