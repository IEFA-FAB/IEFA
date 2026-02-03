// Journal-specific authentication and authorization helpers

import { supabase } from "../supabase"
import { getUserProfile } from "./client"
import type { UserRole } from "./types"

// ============================================
// ROLE CHECKS
// ============================================

/**
 * Check if the current user has editor role
 */
export async function isEditor(userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	try {
		const profile = await getUserProfile(uid)
		if (!profile) return false
		return profile.role === "editor"
	} catch {
		return false
	}
}

/**
 * Check if the current user has reviewer role
 */
export async function isReviewer(userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	try {
		const profile = await getUserProfile(uid)
		if (!profile) return false
		return profile.role === "reviewer"
	} catch {
		return false
	}
}

/**
 * Check if the current user has author role
 */
export async function isAuthor(userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	try {
		const profile = await getUserProfile(uid)
		if (!profile) return false
		return profile.role === "author"
	} catch {
		return false
	}
}

/**
 * Get the current user's role
 */
export async function getUserRole(userId?: string): Promise<UserRole | null> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return null

	try {
		const profile = await getUserProfile(uid)
		if (!profile) return null
		return profile.role
	} catch {
		return null
	}
}

// ============================================
// PERMISSION CHECKS
// ============================================

/**
 * Check if user can edit an article
 * - Article author can edit drafts and revision-requested articles
 * - Editors can edit any article
 */
export async function canEditArticle(articleId: string, userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	// Check if user is editor
	if (await isEditor(uid)) return true

	// Check if user is the article submitter and article is editable
	const { data: article } = await supabase
		.schema("journal")
		.from("articles")
		.select("submitter_id, status")
		.eq("id", articleId)
		.single()

	if (!article) return false

	return (
		article.submitter_id === uid &&
		(article.status === "draft" || article.status === "revision_requested")
	)
}

/**
 * Check if user can view an article
 * - Public can view published articles
 * - Authors can view their own articles
 * - Reviewers can view assigned articles
 * - Editors can view all articles
 */
export async function canViewArticle(articleId: string, userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id

	// Check if article is published (public access)
	const { data: article } = await supabase
		.schema("journal")
		.from("articles")
		.select("status, submitter_id, deleted_at")
		.eq("id", articleId)
		.single()

	if (!article) return false

	// Public can view published articles
	if (article.status === "published" && !article.deleted_at) return true

	// Anonymous users can only view published
	if (!uid) return false

	// Check if user is editor
	if (await isEditor(uid)) return true

	// Check if user is the submitter
	if (article.submitter_id === uid) return true

	// Check if user is assigned reviewer
	const { data: assignment } = await supabase
		.schema("journal")
		.from("review_assignments")
		.select("id")
		.eq("article_id", articleId)
		.eq("reviewer_id", uid)
		.in("status", ["accepted", "completed"])
		.single()

	return !!assignment
}

/**
 * Check if user can submit reviews
 */
export async function canSubmitReview(assignmentId: string, userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	const { data: assignment } = await supabase
		.schema("journal")
		.from("review_assignments")
		.select("reviewer_id, status")
		.eq("id", assignmentId)
		.single()

	if (!assignment) return false

	return assignment.reviewer_id === uid && assignment.status === "accepted"
}

/**
 * Check if user can manage review assignments (invite reviewers)
 */
export async function canManageReviewers(userId?: string): Promise<boolean> {
	return isEditor(userId)
}

/**
 * Check if user can publish articles
 */
export async function canPublishArticles(userId?: string): Promise<boolean> {
	return isEditor(userId)
}

/**
 * Check if user can access editorial dashboard
 */
export async function canAccessEditorialDashboard(userId?: string): Promise<boolean> {
	return isEditor(userId)
}

// ============================================
// PROFILE HELPERS
// ============================================

/**
 * Ensure user has a journal profile
 * Creates one with default values if it doesn't exist
 */
export async function ensureUserProfile(userId: string, fullName?: string): Promise<void> {
	try {
		await getUserProfile(userId)
	} catch {
		// Profile doesn't exist, create it
		const { data: user } = await supabase.auth.getUser()
		await supabase
			.schema("journal")
			.from("user_profiles")
			.insert({
				id: userId,
				full_name: fullName || user.user?.email?.split("@")[0] || "User",
				role: "author", // Default role
			})
	}
}

/**
 * Check if user has completed their profile
 */
export async function hasCompleteProfile(userId: string): Promise<boolean> {
	try {
		const profile = await getUserProfile(userId)
		if (!profile) return false
		// Consider profile complete if full_name and affiliation are filled
		return !!profile.full_name && !!profile.affiliation
	} catch {
		return false
	}
}
