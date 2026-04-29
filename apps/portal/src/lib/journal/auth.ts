// Journal-specific authentication and authorization helpers

import { canEditArticleFn, canSubmitReviewFn, canViewArticleFn } from "@/server/journal-data.fn"
import { supabase } from "../supabase"
import { createUserProfile, getUserProfile } from "./client"
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

	return (await canEditArticleFn({ data: { articleId, userId: uid } })) as boolean
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

	// canViewArticleFn verifica published, submitter e reviewer
	const canView = (await canViewArticleFn({ data: { articleId, userId: uid ?? undefined } })) as boolean
	if (canView) return true

	// Editores podem ver tudo
	if (uid && (await isEditor(uid))) return true

	return false
}

/**
 * Check if user can submit reviews
 */
export async function canSubmitReview(assignmentId: string, userId?: string): Promise<boolean> {
	const uid = userId || (await supabase.auth.getUser()).data.user?.id
	if (!uid) return false

	return (await canSubmitReviewFn({ data: { assignmentId, userId: uid } })) as boolean
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
		await createUserProfile({
			id: userId,
			full_name: fullName || user.user?.email?.split("@")[0] || "User",
			role: "author",
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
