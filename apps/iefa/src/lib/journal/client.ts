// Journal-specific Supabase client helpers
// All queries explicitly use 'journal' schema

import { supabase } from "../supabase";
import type {
	Article,
	ArticleAuthor,
	ArticleVersion,
	EditorialDashboardArticle,
	JournalSettings,
	Notification,
	PublishedArticle,
	Review,
	ReviewAssignment,
	UserProfile,
} from "./types";

// ============================================
// USER PROFILES
// ============================================

/**
 * Retrieves a user profile by user ID.
 * Returns null if profile doesn't exist (user hasn't completed onboarding).
 *
 * @param userId - The UUID of the user
 * @returns User profile or null if not found
 * @throws {Error} Database error
 */
export async function getUserProfile(userId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("user_profiles")
		.select("*")
		.eq("id", userId)
		.maybeSingle();

	if (error) throw error;
	return data as UserProfile | null;
}

/**
 * Creates a new user profile.
 * Used during onboarding flow when user first accesses journal system.
 *
 * @param profile - Partial profile data (id is required)
 * @returns Created profile
 * @throws {Error} If profile already exists or validation fails
 */
export async function createUserProfile(profile: Partial<UserProfile>) {
	const { data, error } = await supabase
		.schema("journal")
		.from("user_profiles")
		.insert(profile)
		.select()
		.single();

	if (error) throw error;
	return data as UserProfile;
}

/**
 * Updates an existing user profile.
 *
 * @param userId - User ID to update
 * @param updates - Partial profile data to update
 * @returns Updated profile
 * @throws {Error} If user not found or update fails
 */
export async function updateUserProfile(
	userId: string,
	updates: Partial<UserProfile>,
) {
	const { data, error } = await supabase
		.schema("journal")
		.from("user_profiles")
		.update(updates)
		.eq("id", userId)
		.select()
		.single();

	if (error) throw error;
	return data as UserProfile;
}

/**
 * Creates or updates a user profile (upsert).
 * Useful for ensuring profile exists without checking first.
 *
 * @param profile - Profile data with id
 * @returns Created or updated profile
 */
export async function upsertUserProfile(profile: Partial<UserProfile>) {
	const { data, error } = await supabase
		.schema("journal")
		.from("user_profiles")
		.upsert(profile)
		.select()
		.single();

	if (error) throw error;
	return data as UserProfile;
}

// ============================================
// ARTICLES
// ============================================

export async function getArticles(filters?: {
	status?: string;
	submitter_id?: string;
	limit?: number;
}) {
	let query = supabase.from("journal.articles").select("*");

	if (filters?.status) {
		query = query.eq("status", filters.status);
	}

	if (filters?.submitter_id) {
		query = query.eq("submitter_id", filters.submitter_id);
	}

	if (filters?.limit) {
		query = query.limit(filters.limit);
	}

	const { data, error } = await query.order("created_at", {
		ascending: false,
	});

	if (error) throw error;
	return data as Article[];
}

export async function getArticle(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("articles")
		.select("*")
		.eq("id", articleId)
		.single();

	if (error) throw error;
	return data as Article;
}

export async function getArticleWithDetails(articleId: string) {
	// Use the helper function from database
	const { data, error } = await supabase.rpc("get_article_details", {
		article_uuid: articleId,
	});

	if (error) throw error;
	return data;
}

export async function createArticle(article: Partial<Article>) {
	const { data, error } = await supabase
		.schema("journal")
		.from("articles")
		.insert(article)
		.select()
		.single();

	if (error) throw error;
	return data as Article;
}

export async function updateArticle(
	articleId: string,
	updates: Partial<Article>,
) {
	const { data, error } = await supabase
		.schema("journal")
		.from("articles")
		.update(updates)
		.eq("id", articleId)
		.select()
		.single();

	if (error) throw error;
	return data as Article;
}

export async function deleteArticle(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("articles")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", articleId)
		.select()
		.single();

	if (error) throw error;
	return data as Article;
}

/**
 * Creates a new article submission.
 * This is the main entry point for authors submitting articles.
 * Sets initial status to 'submitted' and generates a submission number.
 *
 * @param data - Article data including bilingual metadata
 * @returns Created article with generated submission_number
 * @throws {Error} If validation fails or database error
 */
export async function createSubmission(data: CreateSubmissionInput) {
	// Generate submission number (e.g., 2024-001)
	const year = new Date().getFullYear();
	const { count } = await supabase
		.from("journal.articles")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${year}-01-01`);

	const submissionNumber = `${year}-${String((count || 0) + 1).padStart(3, "0")}`;

	const { data: article, error } = await supabase
		.from("journal.articles")
		.insert({
			...data,
			submission_number: submissionNumber,
			status: "submitted",
			submitted_at: new Date().toISOString(),
		})
		.select()
		.single();

	if (error) throw error;
	return article as Article;
}

/**
 * Accepts a review invitation via token.
 * Updates assignment status and records acceptance timestamp.
 *
 * @param token - Unique invitation token from email
 * @returns Updated review assignment
 * @throws {Error} If token invalid or already responded
 */
export async function acceptReviewInvitation(token: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("review_assignments")
		.update({ status: "accepted", responded_at: new Date().toISOString() })
		.eq("invitation_token", token)
		.select()
		.single();

	if (error) throw error;
	return data;
}

/**
 * Declines a review invitation with optional reason.
 *
 * @param token - Invitation token
 * @param reason - Optional decline reason (shown to editor)
 * @returns Updated review assignment
 */
export async function declineReviewInvitation(token: string, reason?: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("review_assignments")
		.update({
			status: "declined",
			responded_at: new Date().toISOString(),
			decline_reason: reason,
		})
		.eq("invitation_token", token)
		.select()
		.single();

	if (error) throw error;
	return data;
}

/**
 * Submits a completed review for an article.
 * Creates/updates review record and marks assignment as completed.
 * This is a transaction-like operation that updates both tables.
 *
 * @param assignmentId - Review assignment ID
 * @param reviewData - Review scores, comments, and recommendation
 * @returns Created review record
 * @throws {Error} If assignment not found or review submission fails
 */
export async function submitReview(
	assignmentId: string,
	reviewData: Partial<Review>,
) {
	// First create/update the review
	const { data: review, error: reviewError } = await supabase
		.schema("journal")
		.from("reviews")
		.upsert({
			assignment_id: assignmentId,
			...reviewData,
			submitted_at: new Date().toISOString(),
		})
		.select()
		.single();

	if (reviewError) throw reviewError;

	// Update assignment status
	const { error: assignmentError } = await supabase
		.schema("journal")
		.from("review_assignments")
		.update({
			status: "completed",
			completed_at: new Date().toISOString(),
		})
		.eq("id", assignmentId);

	if (assignmentError) throw assignmentError;

	return review;
}

// ============================================
// ARTICLE AUTHORS
// ============================================

export async function getArticleAuthors(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_authors")
		.select("*")
		.eq("article_id", articleId)
		.order("author_order", { ascending: true });

	if (error) throw error;
	return data as ArticleAuthor[];
}

export async function createArticleAuthors(authors: Partial<ArticleAuthor>[]) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_authors")
		.insert(authors)
		.select();

	if (error) throw error;
	return data as ArticleAuthor[];
}

export async function updateArticleAuthor(
	authorId: string,
	updates: Partial<ArticleAuthor>,
) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_authors")
		.update(updates)
		.eq("id", authorId)
		.select()
		.single();

	if (error) throw error;
	return data as ArticleAuthor;
}

export async function deleteArticleAuthor(authorId: string) {
	const { error } = await supabase
		.schema("journal")
		.from("article_authors")
		.delete()
		.eq("id", authorId);

	if (error) throw error;
}

// ============================================
// ARTICLE VERSIONS
// ============================================

export async function getArticleVersions(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_versions")
		.select("*")
		.eq("article_id", articleId)
		.order("version_number", { ascending: false });

	if (error) throw error;
	return data as ArticleVersion[];
}

export async function createArticleVersion(version: Partial<ArticleVersion>) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_versions")
		.insert(version)
		.select()
		.single();

	if (error) throw error;
	return data as ArticleVersion;
}

export async function getLatestArticleVersion(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("article_versions")
		.select("*")
		.eq("article_id", articleId)
		.order("version_number", { ascending: false })
		.limit(1)
		.single();

	if (error) throw error;
	return data as ArticleVersion;
}

// ============================================
// PUBLISHED ARTICLES (View)
// ============================================

export async function getPublishedArticles(filters?: {
	limit?: number;
	offset?: number;
}) {
	let query = supabase.from("journal.published_articles").select("*");

	if (filters?.limit) {
		query = query.limit(filters.limit);
	}

	if (filters?.offset) {
		query = query.range(
			filters.offset,
			filters.offset + (filters.limit || 10) - 1,
		);
	}

	const { data, error } = await query.order("published_at", {
		ascending: false,
	});

	if (error) throw error;
	return data as PublishedArticle[];
}

export async function getPublishedArticle(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("published_articles")
		.select("*")
		.eq("id", articleId)
		.single();

	if (error) throw error;
	return data as PublishedArticle;
}

// ============================================
// EDITORIAL DASHBOARD (View)
// ============================================

export async function getEditorialDashboard(filters?: {
	status?: string;
	limit?: number;
}) {
	let query = supabase
		.schema("journal")
		.from("editorial_dashboard")
		.select("*");

	if (filters?.status) {
		query = query.eq("status", filters.status);
	}

	if (filters?.limit) {
		query = query.limit(filters.limit);
	}

	const { data, error } = await query;

	if (error) throw error;
	return data as EditorialDashboardArticle[];
}

// ============================================
// REVIEW ASSIGNMENTS
// ============================================

export async function getReviewAssignments(filters?: {
	article_id?: string;
	reviewer_id?: string;
	status?: string;
}) {
	let query = supabase.from("journal.review_assignments").select("*");

	if (filters?.article_id) {
		query = query.eq("article_id", filters.article_id);
	}

	if (filters?.reviewer_id) {
		query = query.eq("reviewer_id", filters.reviewer_id);
	}

	if (filters?.status) {
		query = query.eq("status", filters.status);
	}

	const { data, error } = await query.order("created_at", {
		ascending: false,
	});

	if (error) throw error;
	return data as ReviewAssignment[];
}

export async function getReviewAssignmentByToken(token: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("review_assignments")
		.select("*")
		.eq("invitation_token", token)
		.single();

	if (error) throw error;
	return data as ReviewAssignment;
}

export async function createReviewAssignment(
	assignment: Partial<ReviewAssignment>,
) {
	const { data, error } = await supabase
		.schema("journal")
		.from("review_assignments")
		.insert(assignment)
		.select()
		.single();

	if (error) throw error;
	return data as ReviewAssignment;
}

export async function updateReviewAssignment(
	assignmentId: string,
	updates: Partial<ReviewAssignment>,
) {
	const { data, error } = await supabase
		.schema("journal")
		.from("review_assignments")
		.update(updates)
		.eq("id", assignmentId)
		.select()
		.single();

	if (error) throw error;
	return data as ReviewAssignment;
}

// ============================================
// REVIEWS
// ============================================

export async function getReview(assignmentId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("reviews")
		.select("*")
		.eq("assignment_id", assignmentId)
		.single();

	if (error) throw error;
	return data as Review;
}

export async function getArticleReviews(articleId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("reviews")
		.select(
			`
      *,
      assignment:review_assignments!inner(article_id)
    `,
		)
		.eq("assignment.article_id", articleId);

	if (error) throw error;
	return data as Review[];
}

export async function createReview(review: Partial<Review>) {
	const { data, error } = await supabase
		.schema("journal")
		.from("reviews")
		.insert(review)
		.select()
		.single();

	if (error) throw error;
	return data as Review;
}

export async function updateReview(reviewId: string, updates: Partial<Review>) {
	const { data, error } = await supabase
		.from("reviews")
		.update(updates)
		.eq("id", reviewId)
		.select()
		.single();

	if (error) throw error;
	return data as Review;
}

// ============================================
// NOTIFICATIONS
// ============================================

export async function getUserNotifications(userId: string, unreadOnly = false) {
	let query = supabase
		.schema("journal")
		.from("notifications")
		.select("*")
		.eq("user_id", userId);

	if (unreadOnly) {
		query = query.eq("read", false);
	}

	const { data, error } = await query.order("created_at", {
		ascending: false,
	});

	if (error) throw error;
	return data as Notification[];
}

export async function markNotificationAsRead(notificationId: string) {
	const { data, error } = await supabase
		.schema("journal")
		.from("notifications")
		.update({ read: true, read_at: new Date().toISOString() })
		.eq("id", notificationId)
		.select()
		.single();

	if (error) throw error;
	return data as Notification;
}

// ============================================
// JOURNAL SETTINGS
// ============================================

export async function getJournalSettings() {
	const { data, error } = await supabase
		.schema("journal")
		.from("journal_settings")
		.select("*")
		.limit(1)
		.single();

	if (error) throw error;
	return data as JournalSettings;
}

export async function updateJournalSettings(updates: Partial<JournalSettings>) {
	// Assuming there's only one settings record
	const settings = await getJournalSettings();

	const { data, error } = await supabase
		.schema("journal")
		.from("journal_settings")
		.update(updates)
		.eq("id", settings.id)
		.select()
		.single();

	if (error) throw error;
	return data as JournalSettings;
}

// ============================================
// STORAGE HELPERS
// ============================================

export async function uploadArticleFile(
	articleId: string,
	versionNumber: number,
	file: File,
	fileType: "manuscript" | "source" | "supplementary",
) {
	const fileExt = file.name.split(".").pop();
	const fileName = `${fileType}.${fileExt}`;
	const filePath = `${articleId}/v${versionNumber}/${fileName}`;

	const { data, error } = await supabase.storage
		.from("journal-submissions")
		.upload(filePath, file, {
			cacheControl: "3600",
			upsert: true,
		});

	if (error) throw error;
	return data.path;
}

export function getArticleFileUrl(bucket: string, path: string) {
	const { data } = supabase.storage.from(bucket).getPublicUrl(path);
	return data.publicUrl;
}

export async function downloadArticleFile(bucket: string, path: string) {
	const { data, error } = await supabase.storage.from(bucket).download(path);

	if (error) throw error;
	return data;
}
