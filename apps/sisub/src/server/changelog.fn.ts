/**
 * @module changelog.fn
 * Thin wrapper delegating to `listChangelogPage` de @iefa/sisub-domain (Drizzle).
 * TABLE: kitchen.changelog (published=true rows only).
 * @domain external
 * @migration done
 */

import { listChangelogPage } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// Reexportados: a rota `_public/changelog` importa os tipos daqui desde a primeira versão.
export type { ChangelogEntry, ChangelogPageResult } from "@iefa/sisub-domain"

/**
 * Fetches a page of published changelog entries ordered by published_at descending, with overfetch-based hasMore detection.
 *
 * @remarks
 * Fetches pageSize+1 rows to detect next page without a COUNT query.
 * Returns nextPage: undefined when hasMore=false.
 */
// Público por contrato: conteúdo da rota _public/changelog.
// nosemgrep: server-fn-missing-auth-guard
export const fetchChangelogPageFn = createServerFn({ method: "GET" })
	.validator(z.object({ page: z.number(), pageSize: z.number() }))
	.handler(async ({ data }) => listChangelogPage(getDb(), data).catch(handleDomainError))
