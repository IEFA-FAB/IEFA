/**
 * Regressão happy-path — operation de NECESSIDADES DE COMPRA (@iefa/sisub-domain).
 * Pipeline read-only: agrega quantidades de insumo a partir de menu_items no intervalo.
 * Foco: cálculo net_quantity × (planned/portionYield), shape de ProcurementNeed e folder.
 */

import { fetchProcurementNeeds } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("procurement operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("daily_menu")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("fetchProcurementNeeds agrega quantidade = net_quantity × (planned/portionYield)", async () => {
		if (!reachable || !seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())

		const folderId = await seeder.seedFolder()
		const ingredientId = await seeder.seedIngredient({ folderId, measureUnit: "KG" })
		const recipeId = await seeder.seedRecipe({ kitchenId: null, portionYield: 100, ingredients: [{ ingredientId, netQuantity: 150 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const date = "2099-05-01"
		const { id: dailyMenuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId, recipeId, plannedPortionQuantity: 200, excludedFromProcurement: 0 })

		const needs = await fetchProcurementNeeds(client, ctx, { startDate: date, endDate: date, kitchenId })
		const need = needs.find((n) => n.ingredient_id === ingredientId)

		expect(need).toBeDefined()
		expect(need?.total_quantity).toBe(300) // 150 × (200/100)
		expect(need?.measure_unit).toBe("KG")
		expect(need?.folder_id).toBe(folderId)
	})

	test("fetchProcurementNeeds retorna [] quando não há cardápio no intervalo", async () => {
		if (!reachable || !seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const needs = await fetchProcurementNeeds(client, ctx, { startDate: "2099-12-01", endDate: "2099-12-02", kitchenId })
		expect(needs).toEqual([])
	})
})
