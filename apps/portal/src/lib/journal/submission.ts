// Submission workflow helpers
// Handles complete article submission flow with database transactions

import { supabase } from "../supabase"
import {
	createArticle,
	createArticleAuthors,
	createArticleVersion,
	updateArticle,
	uploadArticleFile,
} from "./client"
import type { Article } from "./types"
import type { CompleteSubmissionData } from "./validation"

export interface SubmissionResult {
	success: boolean
	article?: Article
	error?: string
}

/**
 * Submit a complete article with all metadata, authors, and files
 * This function handles the entire submission workflow as a transaction
 */
export async function submitArticle(
	data: CompleteSubmissionData,
	userId: string
): Promise<SubmissionResult> {
	try {
		// Step 1: Create article record
		const article = await createArticle({
			submitter_id: userId,
			article_type: data.article_type,
			subject_area: data.subject_area,
			title_pt: data.title_pt,
			title_en: data.title_en,
			abstract_pt: data.abstract_pt,
			abstract_en: data.abstract_en,
			keywords_pt: data.keywords_pt,
			keywords_en: data.keywords_en,
			conflict_of_interest: data.conflict_of_interest,
			funding_info: data.funding_info || null,
			data_availability: data.data_availability || null,
			ethics_approval: data.has_ethics_approval ? data.ethics_approval || null : null,
			status: "submitted",
			submitted_at: new Date().toISOString(),
		})

		// Step 2: Create authors
		const authorRecords = data.authors.map((author, index) => ({
			article_id: article.id,
			full_name: author.full_name,
			email: author.email || null,
			affiliation: author.affiliation || null,
			orcid: author.orcid || null,
			is_corresponding: author.is_corresponding,
			author_order: index + 1,
		}))

		await createArticleAuthors(authorRecords)

		// Step 3: Upload files to storage
		const pdfPath = await uploadArticleFile(article.id, 1, data.pdf_file, "manuscript")

		let sourcePath: string | null = null
		if (data.source_file) {
			sourcePath = await uploadArticleFile(article.id, 1, data.source_file, "source")
		}

		const supplementaryPaths: string[] = []
		if (data.supplementary_files && data.supplementary_files.length > 0) {
			for (let i = 0; i < data.supplementary_files.length; i++) {
				const suppFile = data.supplementary_files[i]
				const path = await uploadArticleFile(article.id, 1, suppFile, "supplementary")
				supplementaryPaths.push(path)
			}
		}

		// Step 4: Create version record
		await createArticleVersion({
			article_id: article.id,
			version_label: "Initial Submission",
			pdf_path: pdfPath,
			source_path: sourcePath,
			supplementary_paths: supplementaryPaths.length > 0 ? supplementaryPaths : null,
			uploaded_by: userId,
		})

		// Step 5: Log submission event
		await supabase
			.schema("journal")
			.from("article_events")
			.insert({
				article_id: article.id,
				user_id: userId,
				event_type: "submitted",
				event_data: {
					submission_number: article.submission_number,
				},
			})

		return {
			success: true,
			article,
		}
	} catch (error) {
		console.error("Submission error:", error)
		return {
			success: false,
			error: error instanceof Error ? error.message : "Submission failed",
		}
	}
}

/**
 * Save article as draft (incomplete submission)
 * Allows users to save progress and continue later
 */
export async function saveDraft(
	data: Partial<CompleteSubmissionData>,
	userId: string,
	articleId?: string
): Promise<SubmissionResult> {
	try {
		let article: Article

		if (articleId) {
			// Update existing draft
			article = await updateArticle(articleId, {
				article_type: data.article_type,
				subject_area: data.subject_area,
				title_pt: data.title_pt,
				title_en: data.title_en,
				abstract_pt: data.abstract_pt,
				abstract_en: data.abstract_en,
				keywords_pt: data.keywords_pt,
				keywords_en: data.keywords_en,
				conflict_of_interest: data.conflict_of_interest,
				funding_info: data.funding_info,
				data_availability: data.data_availability,
				ethics_approval: data.ethics_approval,
			})
		} else {
			// Create new draft
			article = await createArticle({
				submitter_id: userId,
				article_type: data.article_type || "research",
				subject_area: data.subject_area || "",
				title_pt: data.title_pt || "",
				title_en: data.title_en || "",
				abstract_pt: data.abstract_pt || "",
				abstract_en: data.abstract_en || "",
				keywords_pt: data.keywords_pt || [],
				keywords_en: data.keywords_en || [],
				conflict_of_interest: data.conflict_of_interest || "",
				status: "draft",
			})
		}

		// Save authors if provided
		if (data.authors && data.authors.length > 0) {
			// Delete existing authors first if updating
			if (articleId) {
				await supabase
					.schema("journal")
					.from("article_authors")
					.delete()
					.eq("article_id", articleId)
			}

			const authorRecords = data.authors.map((author, index) => ({
				article_id: article.id,
				full_name: author.full_name,
				email: author.email || null,
				affiliation: author.affiliation || null,
				orcid: author.orcid || null,
				is_corresponding: author.is_corresponding,
				author_order: index + 1,
			}))

			await createArticleAuthors(authorRecords)
		}

		return {
			success: true,
			article,
		}
	} catch (error) {
		console.error("Save draft error:", error)
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to save draft",
		}
	}
}

/**
 * Load a draft article for editing
 */
export async function loadDraft(articleId: string) {
	try {
		const { data: article, error: articleError } = await supabase
			.schema("journal")
			.from("articles")
			.select("*")
			.eq("id", articleId)
			.single()

		if (articleError) throw articleError

		const { data: authors, error: authorsError } = await supabase
			.schema("journal")
			.from("article_authors")
			.select("*")
			.eq("article_id", articleId)
			.order("author_order", { ascending: true })

		if (authorsError) throw authorsError

		return {
			article,
			authors: authors || [],
		}
	} catch (error) {
		console.error("Load draft error:", error)
		throw error
	}
}

/**
 * Delete a draft article
 */
export async function deleteDraft(articleId: string): Promise<boolean> {
	try {
		// Soft delete
		await updateArticle(articleId, {
			deleted_at: new Date().toISOString(),
		})
		return true
	} catch (error) {
		console.error("Delete draft error:", error)
		return false
	}
}

/**
 * Check if user can edit article
 */
export async function canEditArticle(articleId: string, userId: string): Promise<boolean> {
	try {
		const { data: article } = await supabase
			.schema("journal")
			.from("articles")
			.select("submitter_id, status")
			.eq("id", articleId)
			.single()

		if (!article) return false

		// User must be submitter and article must be draft or revision_requested
		return (
			article.submitter_id === userId &&
			(article.status === "draft" || article.status === "revision_requested")
		)
	} catch {
		return false
	}
}
