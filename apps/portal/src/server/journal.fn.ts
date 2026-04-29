/**
 * @module journal.fn
 * Server functions for journal article submission workflow.
 * All functions use service role client (RLS bypass).
 *
 * CLIENT: getJournalServerClient
 * TABLES: articles, article_authors, article_versions, article_events
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getJournalServerClient } from "@/lib/supabase.server"

// ─── Shared schemas ───────────────────────────────────────────────────────────

const authorInputSchema = z.object({
	full_name: z.string(),
	email: z.string().optional(),
	affiliation: z.string().optional(),
	orcid: z.string().optional(),
	is_corresponding: z.boolean(),
})

const draftMetadataSchema = z.object({
	article_type: z.enum(["research", "review", "short_communication", "editorial"]).optional(),
	subject_area: z.string().optional(),
	title_pt: z.string().optional(),
	title_en: z.string().optional(),
	abstract_pt: z.string().optional(),
	abstract_en: z.string().optional(),
	keywords_pt: z.array(z.string()).optional(),
	keywords_en: z.array(z.string()).optional(),
	conflict_of_interest: z.string().optional(),
	funding_info: z.string().optional(),
	data_availability: z.string().optional(),
	ethics_approval: z.string().optional(),
	authors: z.array(authorInputSchema).optional(),
})

// ─── saveDraftFn ─────────────────────────────────────────────────────────────

/**
 * Creates a new draft article or updates an existing one.
 * Returns the articleId — use it to track state in the form.
 */
export const saveDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		draftMetadataSchema.extend({
			userId: z.string().uuid(),
			articleId: z.string().uuid().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ articleId: string }> => {
		const supabase = getJournalServerClient()
		const { userId, articleId, authors, ...fields } = data

		let id: string

		if (articleId) {
			// Update existing draft — only non-undefined fields
			const { error } = await supabase
				.from("articles")
				.update({
					...fields,
				})
				.eq("id", articleId)
				.eq("submitter_id", userId)

			if (error) throw new Error(`saveDraft update: ${error.message}`)
			id = articleId
		} else {
			// Create new draft
			const { data: created, error } = await supabase
				.from("articles")
				.insert({
					submitter_id: userId,
					article_type: fields.article_type ?? "research",
					subject_area: fields.subject_area ?? "",
					title_pt: fields.title_pt ?? "",
					title_en: fields.title_en ?? "",
					abstract_pt: fields.abstract_pt ?? "",
					abstract_en: fields.abstract_en ?? "",
					keywords_pt: fields.keywords_pt ?? [],
					keywords_en: fields.keywords_en ?? [],
					conflict_of_interest: fields.conflict_of_interest ?? "",
					status: "draft",
				})
				.select("id")
				.single()

			if (error) throw new Error(`saveDraft insert: ${error.message}`)
			id = created.id
		}

		// Replace authors if provided
		if (authors && authors.length > 0) {
			await supabase.from("article_authors").delete().eq("article_id", id)

			const { error: authorsError } = await supabase.from("article_authors").insert(
				authors.map((a, i) => ({
					article_id: id,
					full_name: a.full_name,
					email: a.email || null,
					affiliation: a.affiliation || null,
					orcid: a.orcid || null,
					is_corresponding: a.is_corresponding,
					author_order: i + 1,
				}))
			)

			if (authorsError) throw new Error(`saveDraft authors: ${authorsError.message}`)
		}

		return { articleId: id }
	})

// ─── saveVersionDraftFn ───────────────────────────────────────────────────────

/**
 * Creates or updates the version-1 record for a draft article.
 * Called immediately after each file upload in step 4 so paths are persisted.
 */
export const saveVersionDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			articleId: z.string().uuid(),
			userId: z.string().uuid(),
			pdfPath: z.string().min(1),
			sourcePath: z.string().optional(),
			supplementaryPaths: z.array(z.string()).optional(),
		})
	)
	.handler(async ({ data }) => {
		const supabase = getJournalServerClient()
		const { articleId, userId, pdfPath, sourcePath, supplementaryPaths } = data

		// Check if version 1 already exists
		const { data: existing } = await supabase
			.from("article_versions")
			.select("id")
			.eq("article_id", articleId)
			.eq("version_number", 1)
			.maybeSingle()

		if (existing) {
			const { error } = await supabase
				.from("article_versions")
				.update({
					pdf_path: pdfPath,
					source_path: sourcePath ?? null,
					supplementary_paths: supplementaryPaths?.length ? supplementaryPaths : null,
				})
				.eq("id", existing.id)

			if (error) throw new Error(`saveVersion update: ${error.message}`)
		} else {
			const { error } = await supabase.from("article_versions").insert({
				article_id: articleId,
				version_number: 1,
				version_label: "Initial Submission",
				pdf_path: pdfPath,
				source_path: sourcePath ?? null,
				supplementary_paths: supplementaryPaths?.length ? supplementaryPaths : null,
				uploaded_by: userId,
			})

			if (error) throw new Error(`saveVersion insert: ${error.message}`)
		}

		return { success: true }
	})

// ─── submitArticleFn ─────────────────────────────────────────────────────────

/**
 * Finalizes a draft article as a submitted submission.
 * Files must already be uploaded (paths stored in article_versions via saveVersionDraftFn).
 * Updates article status, replaces authors, and logs the submission event.
 */
export const submitArticleFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			articleId: z.string().uuid(),
			userId: z.string().uuid(),
			article_type: z.enum(["research", "review", "short_communication", "editorial"]),
			subject_area: z.string(),
			title_pt: z.string(),
			title_en: z.string(),
			abstract_pt: z.string(),
			abstract_en: z.string(),
			keywords_pt: z.array(z.string()),
			keywords_en: z.array(z.string()),
			authors: z.array(authorInputSchema),
			conflict_of_interest: z.string(),
			funding_info: z.string().optional(),
			data_availability: z.string().optional(),
			has_ethics_approval: z.boolean(),
			ethics_approval: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ articleId: string; submissionNumber: string }> => {
		const supabase = getJournalServerClient()
		const { articleId, userId, authors, has_ethics_approval, ethics_approval, ...fields } = data

		// Promote article to submitted
		const { data: article, error: articleError } = await supabase
			.from("articles")
			.update({
				...fields,
				ethics_approval: has_ethics_approval ? (ethics_approval ?? null) : null,
				status: "submitted",
				submitted_at: new Date().toISOString(),
			})
			.eq("id", articleId)
			.select("id, submission_number")
			.single()

		if (articleError) throw new Error(`submitArticle update: ${articleError.message}`)

		// Replace authors
		await supabase.from("article_authors").delete().eq("article_id", articleId)

		const { error: authorsError } = await supabase.from("article_authors").insert(
			authors.map((a, i) => ({
				article_id: articleId,
				full_name: a.full_name,
				email: a.email || null,
				affiliation: a.affiliation || null,
				orcid: a.orcid || null,
				is_corresponding: a.is_corresponding,
				author_order: i + 1,
			}))
		)

		if (authorsError) throw new Error(`submitArticle authors: ${authorsError.message}`)

		// Log submission event
		const { error: eventError } = await supabase.from("article_events").insert({
			article_id: articleId,
			user_id: userId,
			event_type: "submitted",
			event_data: { submission_number: article.submission_number },
		})

		if (eventError) throw new Error(`submitArticle event: ${eventError.message}`)

		return { articleId: article.id, submissionNumber: article.submission_number }
	})
