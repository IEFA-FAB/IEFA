// React Query hooks for journal data
// Provides type-safe data fetching with caching and automatic refetching

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import {
	createArticle,
	createArticleAuthors,
	createArticleVersion,
	createReview,
	createUserProfile,
	deleteArticle,
	getArticle,
	getArticleAuthors,
	getArticles,
	getArticleVersions,
	getArticleWithDetails,
	getEditorialDashboard,
	getJournalSettings,
	getPublishedArticle,
	getPublishedArticles,
	getReview,
	getReviewAssignments,
	getUserNotifications,
	getUserProfile,
	markNotificationAsRead,
	updateArticle,
	updateReview,
	updateUserProfile,
	upsertUserProfile,
} from "./client"
import type { Article, ArticleAuthor, ArticleVersion, Review, UserProfile } from "./types"

// ============================================
// QUERY OPTIONS (for use in loaders and components)
// ============================================

export const articleQueryOptions = (articleId: string) =>
	queryOptions({
		queryKey: ["journal", "article", articleId],
		queryFn: () => getArticle(articleId),
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

export const articleWithDetailsQueryOptions = (articleId: string) =>
	queryOptions({
		queryKey: ["journal", "article", "details", articleId],
		queryFn: () => getArticleWithDetails(articleId),
		staleTime: 1000 * 60, // 1 minute
	})

export const articlesQueryOptions = (filters?: {
	status?: string
	submitter_id?: string
	limit?: number
}) =>
	queryOptions({
		queryKey: ["journal", "articles", filters],
		queryFn: () => getArticles(filters),
		staleTime: 1000 * 60, // 1 minute
	})

export const userProfileQueryOptions = (userId: string) =>
	queryOptions({
		queryKey: ["journal", "user-profile", userId],
		queryFn: () => getUserProfile(userId),
		staleTime: 1000 * 60 * 10, // 10 minutes
	})

export const publishedArticlesQueryOptions = (filters?: { limit?: number; offset?: number }) =>
	queryOptions({
		queryKey: ["journal", "published-articles", filters],
		queryFn: () => getPublishedArticles(filters),
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

export const publishedArticleQueryOptions = (articleId: string) =>
	queryOptions({
		queryKey: ["journal", "published-article", articleId],
		queryFn: () => getPublishedArticle(articleId),
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

export const editorialDashboardQueryOptions = (filters?: { status?: string; limit?: number }) =>
	queryOptions({
		queryKey: ["journal", "editorial-dashboard", filters],
		queryFn: () => getEditorialDashboard(filters),
		staleTime: 1000 * 30, // 30 seconds
	})

export const reviewAssignmentsQueryOptions = (filters?: {
	article_id?: string
	reviewer_id?: string
	status?: string
}) =>
	queryOptions({
		queryKey: ["journal", "review-assignments", filters],
		queryFn: () => getReviewAssignments(filters),
		staleTime: 1000 * 60, // 1 minute
	})

export const reviewQueryOptions = (assignmentId: string) =>
	queryOptions({
		queryKey: ["journal", "review", assignmentId],
		queryFn: () => getReview(assignmentId),
		staleTime: 1000 * 60, // 1 minute
	})

export const notificationsQueryOptions = (userId: string, unreadOnly = false) =>
	queryOptions({
		queryKey: ["journal", "notifications", userId, unreadOnly],
		queryFn: () => getUserNotifications(userId, unreadOnly),
		staleTime: 1000 * 30, // 30 seconds
	})

export const journalSettingsQueryOptions = () =>
	queryOptions({
		queryKey: ["journal", "settings"],
		queryFn: () => getJournalSettings(),
		staleTime: 1000 * 60 * 60, // 1 hour
	})

export const articleAuthorsQueryOptions = (articleId: string) =>
	queryOptions({
		queryKey: ["journal", "article-authors", articleId],
		queryFn: () => getArticleAuthors(articleId),
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

export const articleVersionsQueryOptions = (articleId: string) =>
	queryOptions({
		queryKey: ["journal", "article-versions", articleId],
		queryFn: () => getArticleVersions(articleId),
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

// ============================================
// MUTATIONS
// ============================================

export function useCreateArticle() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (article: Partial<Article>) => createArticle(article),
		onSuccess: () => {
			// Invalidate articles list to refetch
			queryClient.invalidateQueries({ queryKey: ["journal", "articles"] })
		},
	})
}

export function useUpdateArticle() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ articleId, updates }: { articleId: string; updates: Partial<Article> }) =>
			updateArticle(articleId, updates),
		onSuccess: (data) => {
			// Invalidate specific article and articles list
			queryClient.invalidateQueries({
				queryKey: ["journal", "article", data.id],
			})
			queryClient.invalidateQueries({ queryKey: ["journal", "articles"] })
			queryClient.invalidateQueries({
				queryKey: ["journal", "editorial-dashboard"],
			})
		},
	})
}

export function useDeleteArticle() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (articleId: string) => deleteArticle(articleId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["journal", "articles"] })
			queryClient.invalidateQueries({
				queryKey: ["journal", "editorial-dashboard"],
			})
		},
	})
}

export function useCreateUserProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (profile: Partial<UserProfile>) => createUserProfile(profile),
		onSuccess: (data) => {
			queryClient.setQueryData(["journal", "user-profile", data.id], data)
		},
	})
}

export function useUpdateUserProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ userId, updates }: { userId: string; updates: Partial<UserProfile> }) =>
			updateUserProfile(userId, updates),
		onSuccess: (data) => {
			queryClient.setQueryData(["journal", "user-profile", data.id], data)
		},
	})
}

export function useUpsertUserProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (profile: Partial<UserProfile>) => upsertUserProfile(profile),
		onSuccess: (data) => {
			queryClient.setQueryData(["journal", "user-profile", data.id], data)
		},
	})
}

export function useCreateArticleAuthors() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (authors: Partial<ArticleAuthor>[]) => createArticleAuthors(authors),
		onSuccess: (data) => {
			if (data.length > 0) {
				const articleId = data[0].article_id
				queryClient.invalidateQueries({
					queryKey: ["journal", "article-authors", articleId],
				})
			}
		},
	})
}

export function useCreateArticleVersion() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (version: Partial<ArticleVersion>) => createArticleVersion(version),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: ["journal", "article-versions", data.article_id],
			})
			queryClient.invalidateQueries({
				queryKey: ["journal", "article", "details", data.article_id],
			})
		},
	})
}

export function useCreateReview() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (review: Partial<Review>) => createReview(review),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["journal", "review"] })
		},
	})
}

export function useUpdateReview() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ reviewId, updates }: { reviewId: string; updates: Partial<Review> }) =>
			updateReview(reviewId, updates),
		onSuccess: (data) => {
			queryClient.setQueryData(["journal", "review", data.assignment_id], data)
		},
	})
}

export function useMarkNotificationAsRead() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (notificationId: string) => markNotificationAsRead(notificationId),
		onSuccess: (data) => {
			// Invalidate notifications query
			queryClient.invalidateQueries({
				queryKey: ["journal", "notifications", data.user_id],
			})
		},
	})
}
