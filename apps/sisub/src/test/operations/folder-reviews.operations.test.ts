/**
 * Regressão happy-path — operations de REVISÃO DE PASTAS (@iefa/sisub-domain).
 * Foco: inserção de evento de revisão e projeção da view folder_last_review.
 *
 * Espelha ingredient-reviews.operations.test.ts: a revisão de pasta é a mesma
 * conferência, um nível acima na árvore.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { listFolderLastReviews, recordFolderReview } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("folder-reviews operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("folder")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("recordFolderReview cria evento e listFolderLastReviews projeta a última", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		seeder.trackWhere("folder_review", "folder_id", folderId)

		const note = uid("[TEST] revisão ")
		const review = await recordFolderReview(db, ctx, { folderId, note })

		expect(review.folder_id).toBe(folderId)
		expect(review.note).toBe(note)
		expect(review.reviewed_at).toBeTruthy()

		const last = await listFolderLastReviews(db, ctx, { folderId })
		const row = last.find((r) => r.folder_id === folderId)
		expect(row).toBeDefined()
		expect(row?.reviewed_at).toBeTruthy()
	})

	test("a view projeta a revisão MAIS RECENTE, não a primeira", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		seeder.trackWhere("folder_review", "folder_id", folderId)

		await recordFolderReview(db, ctx, { folderId, note: uid("[TEST] primeira ") })
		const segunda = uid("[TEST] segunda ")
		const ultima = await recordFolderReview(db, ctx, { folderId, note: segunda })

		// Histórico preservado (duas linhas), mas a view devolve uma só — a última.
		const last = await listFolderLastReviews(db, ctx, { folderId })
		const rows = last.filter((r) => r.folder_id === folderId)
		expect(rows).toHaveLength(1)
		expect(rows[0]?.reviewed_at).toBe(ultima.reviewed_at)
	})
})
