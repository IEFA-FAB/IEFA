/**
 * Integração — flexibilidade da produção (PR #96).
 * Congela: applyEventTemplate (aditivo, idempotente, guard de tipo), applyTemplate
 * conflictMode=skip com grão de refeição, registro do real na production_task,
 * ajustes do turno (porções + substituição com merge atômico) e PBAC escopado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	adjustProductionPortions,
	applyEventTemplate,
	applyTemplate,
	ensureProductionTasks,
	fetchDayDetails,
	fetchProductionBoard,
	recordProductionSubstitution,
	type UserContext,
	updateProductionTaskRecord,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

/** startDayOfWeek que faz o dia 1 do template cair exatamente em `date`. */
function dowOf(date: string): number {
	const js = new Date(`${date}T00:00:00Z`).getUTCDay()
	return js === 0 ? 7 : js
}

type DayDetailsRow = {
	meal_type_id: string | null
	menu_items: {
		recipe_origin_id: string | null
		planned_portion_quantity: number | string | null
		origin_template_id: string | null
		origin_template_type: string | null
		substitutions: Record<string, { type?: string; rationale?: string }> | null
	}[]
}

describeSupabaseIntegration("production flexibility operations (PR #96)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("production_task")
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

	/** Cozinha + refeição + evento com 1 receita (headcount 50). */
	async function setupEvent(opts?: { templateType?: "event" | "exception" }) {
		if (!seeder) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		seeder.trackWhere("production_task", "kitchen_id", kitchenId)
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100 })
		const templateId = await seeder.seedTemplate({ kitchenId, templateType: opts?.templateType ?? "event" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })
		return { kitchenId, mealTypeId, recipeId, templateId }
	}

	test("applyEventTemplate soma ao dia sem apagar a rotina e stampa a origem", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-01"
		const { kitchenId, mealTypeId, recipeId, templateId } = await setupEvent()

		// Rotina pré-existente no mesmo dia+refeição.
		const routineRecipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100 })
		const { id: dailyMenuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId, recipeId: routineRecipeId, plannedPortionQuantity: 120 })

		const result = await applyEventTemplate(db, ctx, { templateId, kitchenId, dates: [date] })
		expect(result.menusCreated).toBe(0) // reusa o daily_menu da rotina
		expect(result.itemsCreated).toBe(1)
		expect(result.itemsAlreadyApplied).toBe(0)

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayDetailsRow[]
		expect(details.length).toBe(1)
		const items = details[0]?.menu_items ?? []
		expect(items.length).toBe(2)
		const routine = items.find((i) => i.recipe_origin_id === routineRecipeId)
		const event = items.find((i) => i.recipe_origin_id === recipeId)
		expect(routine).toBeTruthy() // rotina intacta
		expect(routine?.origin_template_type ?? null).toBeNull()
		expect(event?.origin_template_id).toBe(templateId)
		expect(event?.origin_template_type).toBe("event")
		expect(Number(event?.planned_portion_quantity)).toBe(50) // headcount por item
	})

	test("applyEventTemplate cria o daily_menu quando o dia está vazio", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-02"
		const { kitchenId, templateId } = await setupEvent({ templateType: "exception" })

		const result = await applyEventTemplate(db, ctx, { templateId, kitchenId, dates: [date] })
		expect(result.menusCreated).toBe(1)
		expect(result.itemsCreated).toBe(1)

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayDetailsRow[]
		expect(details[0]?.menu_items[0]?.origin_template_type).toBe("exception")
	})

	test("applyEventTemplate é idempotente: reaplicar não duplica itens", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-03"
		const { kitchenId, templateId } = await setupEvent()

		await applyEventTemplate(db, ctx, { templateId, kitchenId, dates: [date] })
		const second = await applyEventTemplate(db, ctx, { templateId, kitchenId, dates: [date] })
		expect(second.itemsCreated).toBe(0)
		expect(second.itemsAlreadyApplied).toBe(1)

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayDetailsRow[]
		expect(details.flatMap((d) => d.menu_items).length).toBe(1)
	})

	test("applyEventTemplate rejeita template weekly; applyTemplate rejeita evento", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-04"
		const { kitchenId, templateId } = await setupEvent()
		const weeklyId = await seeder.seedTemplate({ kitchenId, templateType: "weekly" })

		await expect(applyEventTemplate(db, ctx, { templateId: weeklyId, kitchenId, dates: [date] })).rejects.toThrow(/is weekly/)
		await expect(applyTemplate(db, ctx, { templateId, kitchenId, startDate: date, endDate: date, startDayOfWeek: dowOf(date) })).rejects.toThrow(
			/use applyEventTemplate/
		)
	})

	test("applyTemplate conflictMode=skip preserva a refeição planejada mas preenche a vazia (grão de célula)", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-05"
		if (!seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		const mealA = await seeder.seedMealType({ kitchenId, sortOrder: 1 })
		const mealB = await seeder.seedMealType({ kitchenId, sortOrder: 2 })
		const recipeA = await seeder.seedRecipe({ kitchenId })
		const recipeB = await seeder.seedRecipe({ kitchenId })
		const manualRecipe = await seeder.seedRecipe({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId, templateType: "weekly" })
		await seeder.seedTemplateItem({ templateId, mealTypeId: mealA, recipeId: recipeA, dayOfWeek: 1, headcountOverride: 100 })
		await seeder.seedTemplateItem({ templateId, mealTypeId: mealB, recipeId: recipeB, dayOfWeek: 1, headcountOverride: 100 })

		// Dia parcialmente planejado: só a refeição A, com item manual.
		const { id: menuA } = await seeder.seedDailyMenu({ kitchenId, mealTypeId: mealA, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId: menuA, recipeId: manualRecipe, plannedPortionQuantity: 77 })

		const result = await applyTemplate(db, ctx, {
			templateId,
			kitchenId,
			startDate: date,
			endDate: date,
			startDayOfWeek: dowOf(date),
			conflictMode: "skip",
		})
		expect(result.datesSkipped).toEqual([date]) // ≥1 célula preservada
		expect(result.menusCreated).toBe(1) // só a refeição B

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayDetailsRow[]
		expect(details.length).toBe(2)
		const rowA = details.find((d) => d.meal_type_id === mealA)
		const rowB = details.find((d) => d.meal_type_id === mealB)
		// Refeição A preservada com o item manual; B materializada do template.
		expect(rowA?.menu_items.map((i) => i.recipe_origin_id)).toEqual([manualRecipe])
		expect(rowB?.menu_items.map((i) => i.recipe_origin_id)).toEqual([recipeB])
		expect(rowB?.menu_items[0]?.origin_template_type).toBe("weekly")

		// Replace substitui tudo, inclusive a refeição antes preservada.
		const replaced = await applyTemplate(db, ctx, {
			templateId,
			kitchenId,
			startDate: date,
			endDate: date,
			startDayOfWeek: dowOf(date),
			conflictMode: "replace",
		})
		expect(replaced.datesSkipped).toEqual([])
		const after = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayDetailsRow[]
		const afterA = after.find((d) => d.meal_type_id === mealA)
		expect(afterA?.menu_items.map((i) => i.recipe_origin_id)).toEqual([recipeA])
	})

	/** Board com 1 task pronta para os testes do chão de fábrica. */
	async function setupBoardTask(date: string) {
		if (!seeder || !db) throw new Error("no seeder/db")
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		seeder.trackWhere("production_task", "kitchen_id", kitchenId)
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const ingredientId = await seeder.seedIngredient()
		const ingredient2Id = await seeder.seedIngredient()
		const recipeId = await seeder.seedRecipe({
			kitchenId,
			portionYield: 100,
			ingredients: [
				{ ingredientId, netQuantity: 10 },
				{ ingredientId: ingredient2Id, netQuantity: 5 },
			],
		})
		const { id: dailyMenuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		const menuItemId = await seeder.seedMenuItem({ dailyMenuId, recipeId, plannedPortionQuantity: 100 })
		await ensureProductionTasks(db, ctx, { kitchenId, date })
		const board = await fetchProductionBoard(db, ctx, { kitchenId, date })
		const task = board[0]?.task
		if (!task) throw new Error("task not created")
		return { kitchenId, menuItemId, taskId: task.id, ingredientId, ingredient2Id }
	}

	test("updateProductionTaskRecord grava produzido/sobra/notes e o board reflete", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-06"
		const { kitchenId, taskId } = await setupBoardTask(date)

		await updateProductionTaskRecord(db, ctx, { taskId, producedQuantity: 95, leftoverQuantity: 8, notes: "[TEST] efetivo menor" })

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date })
		const task = board[0]?.task as unknown as { produced_quantity: unknown; leftover_quantity: unknown; notes: string | null }
		expect(Number(task.produced_quantity)).toBe(95)
		expect(Number(task.leftover_quantity)).toBe(8)
		expect(task.notes).toBe("[TEST] efetivo menor")

		// Limpar campo: null explícito zera; undefined não mexe.
		await updateProductionTaskRecord(db, ctx, { taskId, leftoverQuantity: null })
		const after = await fetchProductionBoard(db, ctx, { kitchenId, date })
		const t2 = after[0]?.task as unknown as { produced_quantity: unknown; leftover_quantity: unknown }
		expect(Number(t2.produced_quantity)).toBe(95)
		expect(t2.leftover_quantity).toBeNull()
	})

	test("adjustProductionPortions atualiza planned_portion_quantity do menu_item", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-07"
		const { kitchenId, menuItemId } = await setupBoardTask(date)

		await adjustProductionPortions(db, ctx, { menuItemId, plannedPortionQuantity: 140 })

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date })
		expect(Number(board[0]?.menuItem.planned_portion_quantity)).toBe(140)
	})

	test("recordProductionSubstitution concorrente não perde escrita (merge atômico)", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-08"
		const { kitchenId, menuItemId, ingredientId, ingredient2Id } = await setupBoardTask(date)

		await Promise.all([
			recordProductionSubstitution(db, ctx, { menuItemId, ingredientId, rationale: "[TEST] falta A" }),
			recordProductionSubstitution(db, ctx, { menuItemId, ingredientId: ingredient2Id, rationale: "[TEST] falta B" }),
		])

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date })
		const subs = (board[0]?.menuItem.substitutions ?? {}) as Record<string, { type?: string; rationale?: string }>
		expect(Object.keys(subs).sort()).toEqual([ingredientId, ingredient2Id].sort())
		expect(subs[ingredientId]?.type).toBe("production")
	})

	test("PBAC: grant de kitchen-production em outra cozinha não abre o board", async () => {
		if (!reachable || !seeder || !db) return
		const date = "2099-08-09"
		const { kitchenId } = await setupBoardTask(date)

		const otherKitchenCtx: UserContext = {
			userId: "00000000-0000-4000-8000-000000000002",
			permissions: [{ module: "kitchen-production", level: 3, kitchen_id: kitchenId + 999_999, unit_id: null, mess_hall_id: null }],
		}
		await expect(fetchProductionBoard(db, otherKitchenCtx, { kitchenId, date })).rejects.toThrow()
		await expect(ensureProductionTasks(db, otherKitchenCtx, { kitchenId, date })).rejects.toThrow()
	})
})
