/**
 * Regressão happy-path — operations de REVISÃO DE INSUMOS (@iefa/sisub-domain).
 * Foco: inserção de evento de revisão e projeção da view ingredient_last_review.
 */

import { listIngredientLastReviews, recordIngredientReview } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredient-reviews operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("ingredient")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("recordIngredientReview cria evento e listIngredientLastReviews projeta a última", async () => {
		if (!reachable || !seeder) return
		const ingredientId = await seeder.seedIngredient()
		seeder.trackWhere("ingredient_review", "ingredient_id", ingredientId)

		const note = uid("[TEST] revisão ")
		const review = await recordIngredientReview(client, ctx, { ingredientId, note })

		expect(review.ingredient_id).toBe(ingredientId)
		expect(review.note).toBe(note)
		expect(review.reviewed_at).toBeTruthy()

		const last = await listIngredientLastReviews(client, ctx, { ingredientId })
		const row = last.find((r) => r.ingredient_id === ingredientId)
		expect(row).toBeDefined()
		expect(row?.reviewed_at).toBeTruthy()
	})
})
