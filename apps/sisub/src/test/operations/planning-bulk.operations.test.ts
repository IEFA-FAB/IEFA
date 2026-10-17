/**
 * Edição em lote do Agendamento da Produção — contra o banco real.
 *
 * Os casos são os do catálogo (Gestão Cozinha, GC-AGD-18 a 21): apagar vários dias, arrastar a
 * semana, repetir a semana passada, trocar uma preparação em todos os dias e levar as fichas à
 * versão vigente. O que se prova é que o lote obedece às mesmas regras do ajuste de um dia: vai
 * para a lixeira, não mexe no que já começou a ser produzido e não duplica preparação.
 */

import { dailyMenuInKitchen, menuItemsInKitchen, productionTaskInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { clearPlannedDays, fetchDayDetails, refreshRecipeVersionsInDays, replaceRecipeInDays, shiftPlannedDays } from "@iefa/sisub-domain"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

type DayItem = {
	id: string
	recipe_origin_id: string | null
	planned_portion_quantity: number | string | null
	substitutions: Record<string, { rationale?: string }> | null
}
type DayMenu = { id: string; meal_type_id: string | null; forecasted_headcount: number | null; menu_items: DayItem[] }

describeSupabaseIntegration("agendamento da produção — edição em lote", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("menu_template")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	})

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	})

	afterAll(async () => {
		await closeDb?.()
	})

	async function scenario() {
		const sd = seeder
		if (!sd) throw new Error("no seeder")
		const { id: kitchenId } = await sd.seedKitchen()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))
		sd.trackWhere("production_task", "kitchen_id", kitchenId)
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const arroz = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Arroz ") })
		const feijao = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Feijão ") })
		const peixe = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Peixe ") })
		return { kitchenId, mealTypeId, arroz, feijao, peixe }
	}

	/** Um dia com as preparações dadas e o efetivo da refeição. */
	async function seedDay(kitchenId: number, mealTypeId: string, date: string, recipes: string[], headcount = 300) {
		if (!seeder || !db) throw new Error("no seeder")
		const { id: menuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await db.update(dailyMenuInKitchen).set({ forecastedHeadcount: headcount }).where(eq(dailyMenuInKitchen.id, menuId))
		const items: string[] = []
		for (const recipeId of recipes)
			items.push(await seeder.seedMenuItem({ dailyMenuId: menuId, recipeId, plannedPortionQuantity: headcount, recipe: { name: "ficha" } }))
		return { menuId, items }
	}

	async function day(kitchenId: number, date: string): Promise<DayMenu[]> {
		if (!db) throw new Error("no db")
		return (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayMenu[]
	}
	const recipesOf = async (kitchenId: number, date: string) =>
		(await day(kitchenId, date)).flatMap((m) => m.menu_items.map((i) => i.recipe_origin_id)).toSorted()

	test("apagar vários dias: tudo vai para a lixeira, o cardápio sai mesmo com efetivo, e o que está em produção fica", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz, feijao } = await scenario()
		await seedDay(kitchenId, mealTypeId, "2099-08-03", [arroz, feijao])
		const tuesday = await seedDay(kitchenId, mealTypeId, "2099-08-04", [arroz, feijao])
		await db.insert(productionTaskInKitchen).values({ kitchenId, menuItemId: tuesday.items[0] as string, productionDate: "2099-08-04", status: "IN_PROGRESS" })

		const result = await clearPlannedDays(db, ctx, { kitchenId, dates: ["2099-08-03", "2099-08-04"] })
		expect(result).toEqual({ removed: 3, keptStarted: 1 })
		expect(await day(kitchenId, "2099-08-03")).toEqual([])
		expect(await recipesOf(kitchenId, "2099-08-04")).toEqual([arroz])
	})

	test("apagar dia que já passou é recusado", async () => {
		if (!reachable || !db) return
		const { kitchenId } = await scenario()
		await expect(clearPlannedDays(db, ctx, { kitchenId, dates: ["2020-01-06"] })).rejects.toMatchObject({ code: "PAST_DATE" })
	})

	test("arrastar a semana um dia para frente: os dias encadeados abrem caminho, com efetivo e tarefa pendente", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz, feijao } = await scenario()
		const monday = await seedDay(kitchenId, mealTypeId, "2099-08-10", [arroz], 320)
		await seedDay(kitchenId, mealTypeId, "2099-08-11", [feijao], 280)
		await db.insert(productionTaskInKitchen).values({ kitchenId, menuItemId: monday.items[0] as string, productionDate: "2099-08-10", status: "PENDING" })

		const result = await shiftPlannedDays(db, ctx, { kitchenId, dates: ["2099-08-10", "2099-08-11"], offsetDays: 1, mode: "move", replaceTarget: false })
		expect(result.items).toBe(2)
		expect(await day(kitchenId, "2099-08-10")).toEqual([])
		const [tuesday] = await day(kitchenId, "2099-08-11")
		expect(tuesday?.menu_items.map((i) => i.id)).toEqual(monday.items)
		expect(tuesday?.forecasted_headcount).toBe(320)
		expect(await recipesOf(kitchenId, "2099-08-12")).toEqual([feijao])
		const [task] = await db
			.select({ date: productionTaskInKitchen.productionDate })
			.from(productionTaskInKitchen)
			.where(eq(productionTaskInKitchen.menuItemId, monday.items[0] as string))
		expect(task?.date).toBe("2099-08-11")
	})

	test("mover dia com produção iniciada é recusado inteiro", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz, feijao } = await scenario()
		const { items } = await seedDay(kitchenId, mealTypeId, "2099-08-17", [arroz, feijao])
		await db.insert(productionTaskInKitchen).values({ kitchenId, menuItemId: items[0] as string, productionDate: "2099-08-17", status: "DONE" })
		await expect(shiftPlannedDays(db, ctx, { kitchenId, dates: ["2099-08-17"], offsetDays: 7, mode: "move", replaceTarget: false })).rejects.toMatchObject({
			code: "PRODUCTION_ALREADY_STARTED",
		})
		expect(await recipesOf(kitchenId, "2099-08-17")).toEqual([arroz, feijao].toSorted())
	})

	test("repetir a semana: destino ocupado é recusado; com substituir, o destino vai para a lixeira e a origem fica", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz, feijao, peixe } = await scenario()
		await seedDay(kitchenId, mealTypeId, "2099-08-24", [arroz, feijao])
		await seedDay(kitchenId, mealTypeId, "2099-08-31", [peixe])
		const input = { kitchenId, dates: ["2099-08-24"], offsetDays: 7, mode: "copy" as const }

		await expect(shiftPlannedDays(db, ctx, { ...input, replaceTarget: false })).rejects.toMatchObject({ code: "TARGET_NOT_EMPTY" })
		const result = await shiftPlannedDays(db, ctx, { ...input, replaceTarget: true })
		expect(result).toMatchObject({ items: 2, replaced: 1 })
		expect(await recipesOf(kitchenId, "2099-08-31")).toEqual([arroz, feijao].toSorted())
		expect(await recipesOf(kitchenId, "2099-08-24")).toEqual([arroz, feijao].toSorted())
	})

	test("copiar sobre um dos dias copiados é recusado", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz } = await scenario()
		await seedDay(kitchenId, mealTypeId, "2099-09-07", [arroz])
		await seedDay(kitchenId, mealTypeId, "2099-09-08", [arroz])
		await expect(
			shiftPlannedDays(db, ctx, { kitchenId, dates: ["2099-09-07", "2099-09-08"], offsetDays: 1, mode: "copy", replaceTarget: false })
		).rejects.toMatchObject({
			code: "OVERLAP",
		})
	})

	test("trocar uma preparação em vários dias: guarda o motivo e não duplica onde a nova já está", async () => {
		if (!reachable || !db) return
		const { kitchenId, mealTypeId, arroz, feijao, peixe } = await scenario()
		await seedDay(kitchenId, mealTypeId, "2099-09-14", [peixe, arroz])
		await seedDay(kitchenId, mealTypeId, "2099-09-15", [peixe, feijao])

		const result = await replaceRecipeInDays(db, ctx, {
			kitchenId,
			dates: ["2099-09-14", "2099-09-15"],
			fromRecipeId: peixe,
			toRecipeId: feijao,
			rationale: "fornecedor parou de entregar peixe",
		})
		expect(result).toEqual({ replaced: 1, skippedDuplicate: 1, skippedStarted: 0 })
		const [monday] = await day(kitchenId, "2099-09-14")
		const swapped = monday?.menu_items.find((i) => i.recipe_origin_id === feijao)
		expect(swapped?.substitutions?.recipe_swap?.rationale).toBe("fornecedor parou de entregar peixe")
		expect(await recipesOf(kitchenId, "2099-09-15")).toEqual([feijao, peixe].toSorted())
	})

	test("atualizar versões: a ficha vai à versão vigente sem virar troca, e o item repetido sai", async () => {
		if (!reachable || !db || !seeder) return
		const { kitchenId, mealTypeId } = await scenario()
		const v1 = await seeder.seedRecipe({ kitchenId: null, name: uid("[TEST] Strogonoff ") })
		const v2 = await seeder.seedRecipe({ kitchenId: null, baseRecipeId: v1, version: 2, name: uid("[TEST] Strogonoff v2 ") })
		const lone = await seedDay(kitchenId, mealTypeId, "2099-09-21", [v1])
		await seedDay(kitchenId, mealTypeId, "2099-09-22", [v1, v2])

		const result = await refreshRecipeVersionsInDays(db, ctx, { kitchenId, dates: ["2099-09-21", "2099-09-22"] })
		expect(result).toEqual({ updated: 1, merged: 1, skippedStarted: 0 })
		const [monday] = await day(kitchenId, "2099-09-21")
		expect(monday?.menu_items.map((i) => [i.id, i.recipe_origin_id])).toEqual([[lone.items[0], v2]])
		expect(monday?.menu_items[0]?.substitutions?.recipe_swap).toBeUndefined()
		expect(await recipesOf(kitchenId, "2099-09-22")).toEqual([v2])
		const [row] = await db
			.select({ recipe: menuItemsInKitchen.recipe })
			.from(menuItemsInKitchen)
			.where(eq(menuItemsInKitchen.id, lone.items[0] as string))
		expect((row?.recipe as { id?: string } | null)?.id).toBe(v2)
	})
})
