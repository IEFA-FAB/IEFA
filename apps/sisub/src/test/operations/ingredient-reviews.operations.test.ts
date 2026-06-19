/**
 * Regressão happy-path — operations de REVISÃO DE INSUMOS (@iefa/sisub-domain).
 * Foco: inserção de evento de revisão e projeção da view ingredient_last_review.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { listIngredientLastReviews, recordIngredientReview } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredient-reviews operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("ingredient")
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

	test("recordIngredientReview cria evento e listIngredientLastReviews projeta a última", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		seeder.trackWhere("ingredient_review", "ingredient_id", ingredientId)

		const note = uid("[TEST] revisão ")
		const review = await recordIngredientReview(db, ctx, { ingredientId, note })

		expect(review.ingredient_id).toBe(ingredientId)
		expect(review.note).toBe(note)
		expect(review.reviewed_at).toBeTruthy()

		const last = await listIngredientLastReviews(db, ctx, { ingredientId })
		const row = last.find((r) => r.ingredient_id === ingredientId)
		expect(row).toBeDefined()
		expect(row?.reviewed_at).toBeTruthy()
	})
})
