/**
 * Regressão happy-path — operations de PLANEJAMENTO/CARDÁPIO (@iefa/sisub-domain).
 * Foco: upsert idempotente, snapshot de receita no item, filtro de itens deletados
 * em memória, escopo por cozinha (resolveKitchenFrom*), lixeira e substituições.
 */

import {
	addMenuItem,
	fetchDailyMenus,
	fetchDayDetails,
	getTrashItems,
	removeMenuItem,
	restoreMenuItem,
	updateHeadcount,
	updateMenuItem,
	updateSubstitutions,
	upsertDailyMenu,
} from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("planning operations (regressão)", () => {
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

	/** Semeia cozinha + tipo de refeição + receita global + 1 daily_menu. */
	async function scenario() {
		const sd = seeder
		if (!sd) throw new Error("no seeder")
		const { id: kitchenId } = await sd.seedKitchen()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId)) // rede de segurança p/ menus/itens
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const recipeId = await sd.seedRecipe({ kitchenId: null }) // global → addMenuItem aceita
		const { id: dailyMenuId, serviceDate } = await sd.seedDailyMenu({ kitchenId, mealTypeId })
		return { kitchenId, mealTypeId, recipeId, dailyMenuId, serviceDate }
	}

	// Corrigido por 20260617120000_daily_menu_active_unique + reescrita de upsertDailyMenu:
	// índice unique parcial garante 1 cardápio ativo por (data, refeição, cozinha) e a
	// operation faz select-then-insert idempotente.
	test("upsertDailyMenu cria o cardápio e é idempotente no mesmo trio", async () => {
		if (!reachable || !seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		const mealTypeId = await seeder.seedMealType({ kitchenId })

		const created = await upsertDailyMenu(client, ctx, { kitchenId, serviceDate: "2099-03-01", mealTypeId, forecastedHeadcount: 50 })
		expect(Array.isArray(created)).toBe(true)
		expect(created).toHaveLength(1)
		expect(created[0].kitchen_id).toBe(kitchenId)
		expect(created[0].service_date).toBe("2099-03-01")
		expect(created[0].status).toBe("PLANNED")

		// Idempotente: segundo upsert do mesmo trio devolve o existente, sem duplicar.
		const again = await upsertDailyMenu(client, ctx, { kitchenId, serviceDate: "2099-03-01", mealTypeId })
		expect(again).toHaveLength(1)
		expect(again[0].id).toBe(created[0].id)
	})

	test("addMenuItem grava snapshot da receita e fetchDailyMenus retorna itens ativos", async () => {
		if (!reachable || !seeder) return
		const { kitchenId, recipeId, dailyMenuId, serviceDate } = await scenario()

		const inserted = await addMenuItem(client, ctx, { dailyMenuId, recipeId, plannedPortionQuantity: 120 })
		expect(Array.isArray(inserted)).toBe(true)
		expect(inserted[0].recipe_origin_id).toBe(recipeId)
		expect(inserted[0].recipe).toBeTruthy() // snapshot da receita gravado

		const menus = await fetchDailyMenus(client, ctx, { kitchenId, startDate: serviceDate, endDate: serviceDate })
		const menu = menus.find((m) => m.id === dailyMenuId)
		expect(menu).toBeDefined()
		expect(menu?.menu_items.some((it: { id: string }) => it.id === inserted[0].id)).toBe(true)
	})

	test("updateMenuItem altera planned_portion_quantity (write→read)", async () => {
		if (!reachable || !seeder) return
		const { recipeId, dailyMenuId } = await scenario()
		const inserted = await addMenuItem(client, ctx, { dailyMenuId, recipeId, plannedPortionQuantity: 100 })
		const menuItemId = inserted[0].id

		const updated = await updateMenuItem(client, ctx, { menuItemId, plannedPortionQuantity: 250 })
		expect(Number(updated[0].planned_portion_quantity)).toBe(250)
	})

	test("removeMenuItem (soft) sai do fetch e aparece em getTrashItems; restoreMenuItem reverte", async () => {
		if (!reachable || !seeder) return
		const { kitchenId, recipeId, dailyMenuId, serviceDate } = await scenario()
		const inserted = await addMenuItem(client, ctx, { dailyMenuId, recipeId })
		const menuItemId = inserted[0].id

		await removeMenuItem(client, ctx, { menuItemId })
		const menus = await fetchDayDetails(client, ctx, { kitchenId, date: serviceDate })
		const activeIds = menus.flatMap((m) => m.menu_items.map((it: { id: string }) => it.id))
		expect(activeIds).not.toContain(menuItemId)

		const trash = await getTrashItems(client, ctx, { kitchenId })
		expect(trash.map((t) => t.id)).toContain(menuItemId)

		await restoreMenuItem(client, ctx, { menuItemId })
		const menusAfter = await fetchDayDetails(client, ctx, { kitchenId, date: serviceDate })
		const activeAfter = menusAfter.flatMap((m) => m.menu_items.map((it: { id: string }) => it.id))
		expect(activeAfter).toContain(menuItemId)
	})

	test("updateHeadcount grava forecasted_headcount no daily_menu", async () => {
		if (!reachable || !seeder) return
		const { dailyMenuId } = await scenario()

		const updated = await updateHeadcount(client, ctx, { dailyMenuId, forecastedHeadcount: 321 })
		expect(updated[0].forecasted_headcount).toBe(321)
	})

	test("updateSubstitutions persiste o mapa de substituições", async () => {
		if (!reachable || !seeder) return
		const { recipeId, dailyMenuId } = await scenario()
		const inserted = await addMenuItem(client, ctx, { dailyMenuId, recipeId })
		const menuItemId = inserted[0].id

		const substitutions = { arroz: { type: "swap", rationale: "[TEST] motivo", updated_at: "2099-01-01T00:00:00Z" } }
		await updateSubstitutions(client, ctx, { menuItemId, substitutions })

		const { data } = await client.from("menu_items").select("substitutions").eq("id", menuItemId).single()
		expect(data?.substitutions).toMatchObject(substitutions)
	})
})
