/**
 * Integração — alergênicos do insumo e ingredientes das fichas para o cardápio impresso
 * (migration 20260922120000).
 *
 * O que só o banco real prova:
 *  - o CHECK do vocabulário aceita a lista do domínio e a operação grava deduplicada e ordenada;
 *  - a preparação congelada herda os alergênicos da ficha de PRODUÇÃO dela;
 *  - preparação congelada sem ficha nem insumo de origem vai para `unresolved` — a folha não
 *    pode dizer "sem alergênicos" do que ninguém conferiu.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { listRecipeIngredientDigests, updateIngredientAllergens } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("recipe ingredient digests (alergênicos)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
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

	/** Preparação congelada + linha dela numa ficha. Registrada na ordem que o cleanup LIFO desfaz. */
	async function seedFrozenPreparation(s: Seeder, productionRecipeId: string | null): Promise<string> {
		const { data, error } = await client
			.schema("kitchen")
			.from("frozen_preparation")
			.insert({ description: uid("[TEST] Congelada "), production_recipe_id: productionRecipeId })
			.select("id")
			.single()
		if (error) throw new Error(`seed frozen_preparation failed: ${error.message}`)
		s.track("frozen_preparation", data.id)
		return data.id as string
	}

	async function addFrozenLine(recipeId: string, frozenPreparationId: string, priority: number): Promise<void> {
		const { error } = await client
			.schema("kitchen")
			.from("recipe_ingredients")
			.insert({ recipe_id: recipeId, frozen_preparation_id: frozenPreparationId, net_quantity: 50, is_optional: false, priority_order: priority })
		if (error) throw new Error(`seed frozen line failed: ${error.message}`)
	}

	test("insumo grava alergênicos normalizados; ficha lista nomes e herda da preparação congelada", async () => {
		if (!reachable || !seeder || !db) return
		const farinha = await seeder.seedIngredient()
		const queijo = await seeder.seedIngredient()
		const tomate = await seeder.seedIngredient()

		await updateIngredientAllergens(db, ctx, { id: farinha, allergens: ["ovos", "gluten", "ovos"] })
		await updateIngredientAllergens(db, ctx, { id: queijo, allergens: ["leite"] })

		const { data: saved } = await client.schema("kitchen").from("ingredient").select("allergens").eq("id", farinha).single()
		expect(saved?.allergens).toEqual(["gluten", "ovos"])

		// Ficha de produção do molho (com queijo) → preparação congelada → usada na ficha do prato.
		const molhoRecipe = await seeder.seedRecipe({ ingredients: [{ ingredientId: queijo, netQuantity: 30 }] })
		const molho = await seedFrozenPreparation(seeder, molhoRecipe)
		const semFicha = await seedFrozenPreparation(seeder, null)

		const prato = await seeder.seedRecipe({
			ingredients: [
				{ ingredientId: farinha, netQuantity: 100 },
				{ ingredientId: tomate, netQuantity: 80 },
			],
		})
		await addFrozenLine(prato, molho, 2)
		await addFrozenLine(prato, semFicha, 3)

		const [digest] = await listRecipeIngredientDigests(db, ctx, { recipeIds: [prato] })
		expect(digest.recipe_id).toBe(prato)
		expect(digest.ingredients).toHaveLength(4)
		expect(digest.ingredients[0].allergens).toEqual(["gluten", "ovos"])
		expect(digest.ingredients[1].allergens).toEqual([])
		// Molho congelado: o queijo da ficha de produção aparece no alergênico dele.
		expect(digest.ingredients[2].allergens).toEqual(["leite"])
		// Sem ficha de produção nem insumo de origem: não resolvido, não "isento".
		expect(digest.unresolved).toHaveLength(1)
		expect(digest.unresolved[0]).toMatch(/^\[TEST\] Congelada /)
	})

	test("insumo na lixeira vira 'não conferido'; nome repetido une os alergênicos", async () => {
		if (!reachable || !seeder || !db) return
		const farinha = await seeder.seedIngredient()
		const molhoA = await seeder.seedIngredient()
		const molhoB = await seeder.seedIngredient()
		await updateIngredientAllergens(db, ctx, { id: farinha, allergens: ["gluten"] })
		await updateIngredientAllergens(db, ctx, { id: molhoB, allergens: ["leite"] })
		const nome = uid("[TEST] Molho branco ")
		for (const id of [molhoA, molhoB]) {
			const { error } = await client.schema("kitchen").from("ingredient").update({ description: nome }).eq("id", id)
			if (error) throw new Error(error.message)
		}
		const { error: delError } = await client.schema("kitchen").from("ingredient").update({ deleted_at: new Date().toISOString() }).eq("id", farinha)
		if (delError) throw new Error(delError.message)

		const prato = await seeder.seedRecipe({
			ingredients: [
				{ ingredientId: farinha, netQuantity: 100 },
				{ ingredientId: molhoA, netQuantity: 50 },
				{ ingredientId: molhoB, netQuantity: 50 },
			],
		})

		const [digest] = await listRecipeIngredientDigests(db, ctx, { recipeIds: [prato] })
		expect(digest.ingredients).toHaveLength(2)
		expect(digest.unresolved).toHaveLength(1)
		expect(digest.unresolved[0]).toMatch(/^\[TEST\] Insumo /)
		expect(digest.ingredients.find((i) => i.name === nome)?.allergens).toEqual(["leite"])
	})

	test("valor fora do vocabulário é recusado pelo CHECK do banco", async () => {
		if (!reachable || !seeder) return
		const id = await seeder.seedIngredient()
		const { error } = await client
			.schema("kitchen")
			.from("ingredient")
			.update({ allergens: ["sulfito"] })
			.eq("id", id)
		expect(error?.message ?? "").toMatch(/ingredient_allergens_check|violates check/i)
	})

	test("lista vazia de ids não consulta nada", async () => {
		if (!db) return
		expect(await listRecipeIngredientDigests(db, ctx, { recipeIds: [] })).toEqual([])
	})
})
