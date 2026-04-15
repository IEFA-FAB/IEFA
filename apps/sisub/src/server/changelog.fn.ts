/**
 * @module changelog.fn
 * Paginated reader for published changelog entries.
 * CLIENT: getSupabaseServerClient (service role).
 * TABLE: changelog (published=true rows only).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export type ChangelogEntry = {
	id: string
	version: string | null
	title: string
	body: string
	tags: string[] | null
	published_at: string
	published: boolean
}

export type ChangelogPageResult = {
	items: ChangelogEntry[]
	nextPage?: number
	hasMore: boolean
}

/**
 * Fetches a page of published changelog entries ordered by published_at descending, with overfetch-based hasMore detection.
 *
 * @remarks
 * Fetches pageSize+1 rows to detect next page without a COUNT query.
 * Returns nextPage: undefined when hasMore=false.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchChangelogPageFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ page: z.number(), pageSize: z.number() }))
	.handler(async ({ data }): Promise<ChangelogPageResult> => {
		const from = data.page * data.pageSize
		const to = from + data.pageSize // overfetch +1 to detect hasMore

		const { data: rows, error } = await getSupabaseServerClient()
			.from("changelog")
			.select("id, version, title, body, tags, published_at, published")
			.eq("published", true)
			.order("published_at", { ascending: false })
			.range(from, to)

		if (error) throw new Error(error.message || "Não foi possível carregar o changelog.")

		const allRows = (rows as ChangelogEntry[]) ?? []
		const hasMore = allRows.length > data.pageSize
		const items = hasMore ? allRows.slice(0, data.pageSize) : allRows

		return { items, nextPage: hasMore ? data.page + 1 : undefined, hasMore }
	})
