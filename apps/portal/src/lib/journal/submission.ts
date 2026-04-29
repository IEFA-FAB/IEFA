// Submission workflow helpers — draft read/delete utilities.
// Draft creation/update → saveDraftFn (src/server/journal.fn.ts)
// File upload + version persistence → saveVersionDraftFn (src/server/journal.fn.ts)
// Final submission → submitArticleFn (src/server/journal.fn.ts)

import { canEditArticleFn, loadDraftFn } from "@/server/journal-data.fn"
import { updateArticle } from "./client"
import type { Article, ArticleAuthor } from "./types"

/**
 * Load a draft article with its authors for editing.
 */
export async function loadDraft(articleId: string): Promise<{ article: Article; authors: ArticleAuthor[] }> {
	return (await loadDraftFn({ data: { articleId } })) as { article: Article; authors: ArticleAuthor[] }
}

/**
 * Soft-delete a draft article.
 */
export async function deleteDraft(articleId: string): Promise<boolean> {
	try {
		await updateArticle(articleId, { deleted_at: new Date().toISOString() })
		return true
	} catch {
		return false
	}
}

/**
 * Check whether the given user can edit an article
 * (must be the submitter and status must be draft or revision_requested).
 */
export async function canEditArticle(articleId: string, userId: string): Promise<boolean> {
	try {
		return (await canEditArticleFn({ data: { articleId, userId } })) as boolean
	} catch {
		return false
	}
}
