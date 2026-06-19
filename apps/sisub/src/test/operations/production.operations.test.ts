/**
 * Regressão happy-path — operations do QUADRO DE PRODUÇÃO (@iefa/sisub-domain).
 * Congela: ensureProductionTasks idempotente, shape do board, máquina de estados de status.
 */

import { ensureProductionTasks, fetchProductionBoard, updateProductionTaskStatus } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("production operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("production_task")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	async function setupBoard(date: string) {
		if (!seeder) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		seeder.trackWhere("production_task", "kitchen_id", kitchenId)
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100 })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const { id: dailyMenuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId, recipeId })
		return { kitchenId, recipeId, mealTypeId }
	}

	test("fetchProductionBoard vazio antes de ensureProductionTasks (só itens com task)", async () => {
		if (!reachable || !seeder) return
		const date = "2099-07-01"
		const { kitchenId } = await setupBoard(date)

		const before = await fetchProductionBoard(client, ctx, { kitchenId, date })
		expect(before).toEqual([])
	})

	test("ensureProductionTasks cria tasks PENDING (idempotente) e o board reflete", async () => {
		if (!reachable || !seeder) return
		const date = "2099-07-02"
		const { kitchenId } = await setupBoard(date)

		const r1 = await ensureProductionTasks(client, ctx, { kitchenId, date })
		expect(r1.created).toBe(1)
		// idempotente: 2ª chamada não duplica (upsert ignoreDuplicates por menu_item_id)
		const r2 = await ensureProductionTasks(client, ctx, { kitchenId, date })
		expect(r2.created).toBe(0)

		const board = await fetchProductionBoard(client, ctx, { kitchenId, date })
		expect(board).toHaveLength(1)
		const item = board[0] as { task: { status: string }; menuItem: unknown; mealType: unknown }
		expect(item.task.status).toBe("PENDING")
		expect(item.menuItem).toBeDefined()
		expect(item.mealType).toBeDefined()
	})

	test("updateProductionTaskStatus gerencia timestamps por estado", async () => {
		if (!reachable || !seeder) return
		const date = "2099-07-03"
		const { kitchenId } = await setupBoard(date)
		await ensureProductionTasks(client, ctx, { kitchenId, date })
		const board = await fetchProductionBoard(client, ctx, { kitchenId, date })
		const taskId = (board[0] as { task: { id: string } }).task.id

		const inProgress = await updateProductionTaskStatus(client, ctx, { taskId, status: "IN_PROGRESS" })
		expect(inProgress.status).toBe("IN_PROGRESS")
		expect(inProgress.started_at).toBeTruthy()
		expect(inProgress.completed_at).toBeNull()

		const done = await updateProductionTaskStatus(client, ctx, { taskId, status: "DONE" })
		expect(done.status).toBe("DONE")
		expect(done.completed_at).toBeTruthy()

		const reset = await updateProductionTaskStatus(client, ctx, { taskId, status: "PENDING" })
		expect(reset.started_at).toBeNull()
		expect(reset.completed_at).toBeNull()
	})
})
