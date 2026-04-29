// Journal data access helpers — thin wrappers em torno dos server fns.
// Todas as queries executam no servidor. Este módulo preserva a API original
// para que hooks.ts e submission.ts requeiram mudanças mínimas.

import { supabase } from "@/lib/supabase"
import {
	acceptReviewInvitationFn,
	createArticleAuthorsFn,
	createArticleFn,
	createArticleVersionFn,
	createReviewAssignmentFn,
	createReviewFn,
	createSubmissionFn,
	createUserProfileFn,
	declineReviewInvitationFn,
	deleteArticleAuthorFn,
	deleteArticleAuthorsByArticleIdFn,
	deleteArticleFn,
	getArticleAuthorsFn,
	getArticleFn,
	getArticleReviewsFn,
	getArticlesFn,
	getArticleVersionsFn,
	getArticleWithDetailsFn,
	getEditorialDashboardFn,
	getJournalSettingsFn,
	getLatestArticleVersionFn,
	getPublishedArticleFn,
	getPublishedArticlesFn,
	getReviewAssignmentByTokenFn,
	getReviewAssignmentsFn,
	getReviewFn,
	getUserActiveDraftFn,
	getUserNotificationsFn,
	getUserProfileFn,
	markNotificationAsReadFn,
	submitReviewFn,
	updateArticleAuthorFn,
	updateArticleFn,
	updateJournalSettingsFn,
	updateReviewAssignmentFn,
	updateReviewFn,
	updateUserProfileFn,
	upsertUserProfileFn,
} from "@/server/journal-data.fn"
import { getSignedDownloadUrlFn, getSignedUploadUrlFn } from "@/server/journal-storage.fn"
import type {
	Article,
	ArticleAuthor,
	ArticleVersion,
	CreateSubmissionInput,
	EditorialDashboardArticle,
	JournalSettings,
	Notification,
	PublishedArticle,
	Review,
	ReviewAssignment,
	UserProfile,
} from "./types"

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
	return (await getUserProfileFn({ data: { userId } })) as UserProfile | null
}

export async function createUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
	return (await createUserProfileFn({ data: profile as Record<string, unknown> })) as UserProfile
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
	return (await updateUserProfileFn({ data: { userId, updates: updates as Record<string, unknown> } })) as UserProfile
}

export async function upsertUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
	return (await upsertUserProfileFn({ data: profile as Record<string, unknown> })) as UserProfile
}

// ─── Articles ─────────────────────────────────────────────────────────────────

export async function getArticles(filters?: { status?: string; submitter_id?: string; limit?: number }): Promise<Article[]> {
	return (await getArticlesFn({ data: filters ?? {} })) as Article[]
}

export async function getArticle(articleId: string): Promise<Article> {
	return (await getArticleFn({ data: { articleId } })) as Article
}

export async function getArticleWithDetails(articleId: string) {
	return getArticleWithDetailsFn({ data: { articleId } })
}

export async function getUserActiveDraft(userId: string): Promise<{ article: Article; authors: ArticleAuthor[]; version: ArticleVersion | null } | null> {
	return (await getUserActiveDraftFn({ data: { userId } })) as { article: Article; authors: ArticleAuthor[]; version: ArticleVersion | null } | null
}

export async function createArticle(article: Partial<Article>): Promise<Article> {
	return (await createArticleFn({ data: article as Record<string, unknown> })) as Article
}

export async function updateArticle(articleId: string, updates: Partial<Article>): Promise<Article> {
	return (await updateArticleFn({ data: { articleId, updates: updates as Record<string, unknown> } })) as Article
}

export async function deleteArticle(articleId: string): Promise<Article> {
	return (await deleteArticleFn({ data: { articleId } })) as Article
}

export async function createSubmission(data: CreateSubmissionInput): Promise<Article> {
	return (await createSubmissionFn({ data: data as unknown as Record<string, unknown> })) as Article
}

// ─── Article Authors ──────────────────────────────────────────────────────────

export async function getArticleAuthors(articleId: string): Promise<ArticleAuthor[]> {
	return (await getArticleAuthorsFn({ data: { articleId } })) as ArticleAuthor[]
}

export async function createArticleAuthors(authors: Partial<ArticleAuthor>[]): Promise<ArticleAuthor[]> {
	return (await createArticleAuthorsFn({ data: authors as Record<string, unknown>[] })) as ArticleAuthor[]
}

export async function updateArticleAuthor(authorId: string, updates: Partial<ArticleAuthor>): Promise<ArticleAuthor> {
	return (await updateArticleAuthorFn({ data: { authorId, updates: updates as Record<string, unknown> } })) as ArticleAuthor
}

export async function deleteArticleAuthor(authorId: string): Promise<void> {
	await deleteArticleAuthorFn({ data: { authorId } })
}

export async function deleteArticleAuthorsByArticleId(articleId: string): Promise<void> {
	await deleteArticleAuthorsByArticleIdFn({ data: { articleId } })
}

// ─── Article Versions ─────────────────────────────────────────────────────────

export async function getArticleVersions(articleId: string): Promise<ArticleVersion[]> {
	return (await getArticleVersionsFn({ data: { articleId } })) as ArticleVersion[]
}

export async function createArticleVersion(version: Partial<ArticleVersion>): Promise<ArticleVersion> {
	return (await createArticleVersionFn({ data: version as Record<string, unknown> })) as ArticleVersion
}

export async function getLatestArticleVersion(articleId: string): Promise<ArticleVersion> {
	return (await getLatestArticleVersionFn({ data: { articleId } })) as ArticleVersion
}

// ─── Published Articles ───────────────────────────────────────────────────────

export async function getPublishedArticles(filters?: { limit?: number; offset?: number }): Promise<PublishedArticle[]> {
	return (await getPublishedArticlesFn({ data: filters ?? {} })) as PublishedArticle[]
}

export async function getPublishedArticle(articleId: string): Promise<PublishedArticle> {
	return (await getPublishedArticleFn({ data: { articleId } })) as PublishedArticle
}

// ─── Editorial Dashboard ──────────────────────────────────────────────────────

export async function getEditorialDashboard(filters?: { status?: string; limit?: number }): Promise<EditorialDashboardArticle[]> {
	return (await getEditorialDashboardFn({ data: filters ?? {} })) as EditorialDashboardArticle[]
}

// ─── Review Assignments ───────────────────────────────────────────────────────

export async function getReviewAssignments(filters?: { article_id?: string; reviewer_id?: string; status?: string }): Promise<ReviewAssignment[]> {
	return (await getReviewAssignmentsFn({ data: filters ?? {} })) as ReviewAssignment[]
}

export async function getReviewAssignmentByToken(token: string): Promise<ReviewAssignment> {
	return (await getReviewAssignmentByTokenFn({ data: { token } })) as ReviewAssignment
}

export async function createReviewAssignment(assignment: Partial<ReviewAssignment>): Promise<ReviewAssignment> {
	return (await createReviewAssignmentFn({ data: assignment as Record<string, unknown> })) as ReviewAssignment
}

export async function updateReviewAssignment(assignmentId: string, updates: Partial<ReviewAssignment>): Promise<ReviewAssignment> {
	return (await updateReviewAssignmentFn({ data: { assignmentId, updates: updates as Record<string, unknown> } })) as ReviewAssignment
}

export async function acceptReviewInvitation(token: string) {
	return acceptReviewInvitationFn({ data: { token } })
}

export async function declineReviewInvitation(token: string, reason?: string) {
	return declineReviewInvitationFn({ data: { token, reason } })
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function getReview(assignmentId: string): Promise<Review> {
	return (await getReviewFn({ data: { assignmentId } })) as Review
}

export async function getArticleReviews(articleId: string): Promise<Review[]> {
	return (await getArticleReviewsFn({ data: { articleId } })) as Review[]
}

export async function createReview(review: Partial<Review>): Promise<Review> {
	return (await createReviewFn({ data: review as Record<string, unknown> })) as Review
}

export async function updateReview(reviewId: string, updates: Partial<Review>): Promise<Review> {
	return (await updateReviewFn({ data: { reviewId, updates: updates as Record<string, unknown> } })) as Review
}

export async function submitReview(assignmentId: string, reviewData: Partial<Review>) {
	return submitReviewFn({ data: { assignmentId, reviewData: reviewData as Record<string, unknown> } })
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getUserNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
	return (await getUserNotificationsFn({ data: { userId, unreadOnly } })) as Notification[]
}

export async function markNotificationAsRead(notificationId: string): Promise<Notification> {
	return (await markNotificationAsReadFn({ data: { notificationId } })) as Notification
}

// ─── Journal Settings ─────────────────────────────────────────────────────────

export async function getJournalSettings(): Promise<JournalSettings> {
	return (await getJournalSettingsFn()) as JournalSettings
}

export async function updateJournalSettings(updates: Partial<JournalSettings>): Promise<JournalSettings> {
	return (await updateJournalSettingsFn({ data: updates as Record<string, unknown> })) as JournalSettings
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * Upload via signed URL:
 * 1. Server gera signed URL (autorização no servidor)
 * 2. Client faz upload direto ao storage (bytes não trafegam pelo servidor)
 */
export async function uploadArticleFile(
	articleId: string,
	versionNumber: number,
	file: File,
	fileType: "manuscript" | "source" | "supplementary",
	index?: number
): Promise<string> {
	const fileExt = file.name.split(".").pop()
	const fileName = fileType === "supplementary" && index !== undefined ? `supplementary_${index}.${fileExt}` : `${fileType}.${fileExt}`
	const filePath = `${articleId}/v${versionNumber}/${fileName}`

	const { token } = await getSignedUploadUrlFn({ data: { filePath } })

	const { data, error } = await supabase.storage.from("journal-submissions").uploadToSignedUrl(filePath, token, file, { cacheControl: "3600", upsert: true })

	if (error) throw error
	return data.path
}

/** URL pública — não requer auth, apenas constrói a URL. */
export function getArticleFileUrl(bucket: string, path: string): string {
	const { data } = supabase.storage.from(bucket).getPublicUrl(path)
	return data.publicUrl
}

/** Download via signed URL gerada no servidor. */
export async function downloadArticleFile(bucket: string, path: string): Promise<Blob> {
	const signedUrl = await getSignedDownloadUrlFn({ data: { bucket, path } })
	const response = await fetch(signedUrl as string)
	if (!response.ok) throw new Error(`Download failed: ${response.statusText}`)
	return response.blob()
}
