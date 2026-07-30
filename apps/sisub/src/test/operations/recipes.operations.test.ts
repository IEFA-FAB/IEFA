/**
 * Regressão happy-path — operations de RECEITAS (@iefa/sisub-domain).
 * Congela o contrato de comportamento ANTES da migração para Drizzle.
 * Foco: dedup de família (maior versão), filtro deleted_at, ordenação pt-BR,
 * shape de select aninhado, versionamento e round-trip write→read.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createRecipe,
	deleteRecipe,
	fetchRecipe,
	listRecipeMenuUsage,
	listRecipes,
	listRecipeVersions,
	renameRecipe,
	restoreRecipe,
	saveRecipeEdit,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("recipes operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration()
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

	test("createRecipe insere receita global + ingredientes e retorna a linha", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()

		const recipe = await createRecipe(db, ctx, {
			name: uid("[TEST] Receita "),
			portionYield: 100,
			kitchenId: null,
			ingredients: [{ ingredientId, netQuantity: 150, isOptional: false, priorityOrder: 0 }],
		})
		seeder.track("recipes", recipe.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", recipe.id)

		expect(recipe.id).toBeTruthy()
		expect(recipe.version).toBe(1)
		expect(recipe.kitchen_id).toBeNull()
		expect(Number(recipe.portion_yield)).toBe(100)
	})

	test("fetchRecipe retorna receita com ingredientes aninhados (shape)", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const recipeId = await seeder.seedRecipe({ ingredients: [{ ingredientId, netQuantity: 200 }] })

		const recipe = await fetchRecipe(db, ctx, { recipeId })

		expect(recipe.id).toBe(recipeId)
		expect(Array.isArray(recipe.ingredients)).toBe(true)
		expect(recipe.ingredients).toHaveLength(1)
		expect(recipe.ingredients[0].ingredient?.id).toBe(ingredientId)
	})

	test("listRecipes faz dedup por família mantendo a maior versão", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await createRecipe(db, ctx, { name: uid("[TEST] Família "), portionYield: 100, kitchenId: null })
		seeder.track("recipes", v1.id)
		const { recipe: v2 } = await saveRecipeEdit(db, ctx, {
			name: v1.name,
			portionYield: 120,
			baseRecipeId: v1.id,
			context: { scope: "global" },
		})
		seeder.track("recipes", v2.id)

		const recipes = await listRecipes(db, ctx, { kitchenId: null })
		const ids = recipes.map((r) => r.id)

		expect(ids).toContain(v2.id) // versão mais nova representa a família
		expect(ids).not.toContain(v1.id) // versão antiga é suprimida
	})

	test("listRecipes ordena por nome em pt-BR", async () => {
		if (!reachable || !seeder || !db) return
		const za = await seeder.seedRecipe({ name: uid("[TEST] ZZZ ") })
		const ab = await seeder.seedRecipe({ name: uid("[TEST] AAA ") })

		const recipes = await listRecipes(db, ctx, { kitchenId: null })
		const idxA = recipes.findIndex((r) => r.id === ab)
		const idxZ = recipes.findIndex((r) => r.id === za)

		expect(idxA).toBeGreaterThanOrEqual(0)
		expect(idxZ).toBeGreaterThan(idxA)
	})

	test("deleteRecipe (soft) some da listagem default e reaparece com includeDeleted; restoreRecipe reverte", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] SoftDel ") })

		await deleteRecipe(db, ctx, { id: recipeId })
		const visivel = await listRecipes(db, ctx, { kitchenId: null })
		expect(visivel.map((r) => r.id)).not.toContain(recipeId)

		const comLixeira = await listRecipes(db, ctx, { kitchenId: null, includeDeleted: true })
		expect(comLixeira.map((r) => r.id)).toContain(recipeId)

		await restoreRecipe(db, ctx, { id: recipeId })
		const restaurada = await listRecipes(db, ctx, { kitchenId: null })
		expect(restaurada.map((r) => r.id)).toContain(recipeId)
	})

	test("saveRecipeEdit no contexto global cria nova versão com base_recipe_id na raiz", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await seeder.seedRecipe({ name: uid("[TEST] Versionada ") })

		const { recipe: v2, forked } = await saveRecipeEdit(db, ctx, {
			name: "[TEST] Versionada v2",
			portionYield: 130,
			baseRecipeId: v1,
			context: { scope: "global" },
		})
		seeder.track("recipes", v2.id)

		expect(forked).toBe(false)
		expect(v2.version).toBe(2)
		expect(v2.base_recipe_id).toBe(v1)
		expect(v2.kitchen_id).toBeNull()

		// A terceira versão continua apontando para a RAIZ, não para o pai imediato —
		// senão a família se parte e duas versões aparecem juntas na listagem.
		const { recipe: v3 } = await saveRecipeEdit(db, ctx, {
			name: "[TEST] Versionada v3",
			portionYield: 140,
			baseRecipeId: v2.id,
			context: { scope: "global" },
		})
		seeder.track("recipes", v3.id)

		expect(v3.version).toBe(3)
		expect(v3.base_recipe_id).toBe(v1)

		const listadas = await listRecipes(db, ctx, { kitchenId: null })
		const ids = listadas.map((r) => r.id)
		expect(ids).toContain(v3.id)
		expect(ids).not.toContain(v2.id)
		expect(ids).not.toContain(v1)
	})

	test("listRecipeVersions retorna a família ordenada por version asc", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await seeder.seedRecipe({ name: uid("[TEST] Hist ") })
		const v2 = await seeder.seedRecipe({ name: uid("[TEST] Hist "), baseRecipeId: v1, version: 2 })

		const versions = await listRecipeVersions(db, ctx, { recipeId: v1 })
		const ids = versions.map((r) => r.id)

		expect(ids).toContain(v1)
		expect(ids).toContain(v2)
		const nums = versions.map((r) => r.version)
		expect(nums).toEqual([...nums].sort((a, b) => a - b))
	})

	test("renameRecipe altera o nome in-place (write→read)", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Antigo ") })
		const novoNome = uid("[TEST] Renomeado ")

		await renameRecipe(db, ctx, { id: recipeId, name: novoNome })
		const recipe = await fetchRecipe(db, ctx, { recipeId })

		expect(recipe.name).toBe(novoNome)
	})

	test("listRecipeMenuUsage retorna IDs de receitas usadas em template semanal", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Usada ") })
		const mealTypeId = await seeder.seedMealType()
		const templateId = await seeder.seedTemplate({ templateType: "weekly" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1 })

		const usage = await listRecipeMenuUsage(db, ctx)
		expect(usage).toContain(recipeId)
	})
})
