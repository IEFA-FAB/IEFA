/**
 * Kitchen production-board operations: production_task lifecycle. Drizzle query layer.
 *
 * Auth posture preserved: authenticated entrypoints with no module-level PBAC guard.
 *
 * State machine: PENDING -> IN_PROGRESS (sets started_at) -> DONE (sets
 * completed_at) -> PENDING (clears both timestamps).
 */

import { dailyMenuInKitchen, menuItemsInKitchen, productionTaskInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, eq, isNull } from "drizzle-orm"
import type { EnsureProductionTasks, FetchProductionBoard, UpdateProductionTaskStatus } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery, toWire } from "../utils/index.ts"

const RECIPE_RELATIONS: Record<string, string> = { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }

type ProductionTask = Tables<"production_task">
type BoardItem = {
	task: ProductionTask
	menuItem: {
		id: string
		recipe_origin_id: string | null
		planned_portion_quantity: string | null
		recipe_origin: Record<string, unknown> | null
		recipe_with_ingredients: Record<string, unknown> | null
	}
	mealType: Record<string, unknown> | null
}

/**
 * Returns production items for a kitchen on a date. Only items that already have
 * a production_task are returned — call ensureProductionTasks first to create them.
 */
export async function fetchProductionBoard(db: SisubDb, _ctx: UserContext, input: FetchProductionBoard): Promise<BoardItem[]> {
	const dailyMenus = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { id: true, mealTypeId: true, forecastedHeadcount: true },
			with: {
				mealTypeInKitchen: { columns: { id: true, name: true, sortOrder: true } },
				menuItemsInKitchens: {
					// Filtra soft-deleted no SQL (Drizzle permite where em relation aninhada — PostgREST não).
					where: isNull(menuItemsInKitchen.deletedAt),
					columns: { id: true, recipeOriginId: true, plannedPortionQuantity: true },
					with: {
						recipesInKitchen: {
							columns: { id: true, name: true, portionYield: true, preparationMethod: true, preparationTimeMinutes: true, kitchenId: true },
							with: {
								recipeIngredientsInKitchens: {
									columns: { id: true, netQuantity: true, priorityOrder: true, isOptional: true },
									with: { ingredientInKitchen: { columns: { id: true, description: true, measureUnit: true } } },
								},
							},
						},
						productionTaskInKitchens: {
							columns: {
								id: true,
								status: true,
								startedAt: true,
								completedAt: true,
								notes: true,
								updatedAt: true,
								createdAt: true,
								kitchenId: true,
								menuItemId: true,
								productionDate: true,
							},
						},
					},
				},
			},
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
		})
	)

	const items: BoardItem[] = []
	for (const menu of dailyMenus) {
		const mealType = menu.mealTypeInKitchen ? toWire<Record<string, unknown>>(menu.mealTypeInKitchen) : null

		for (const menuItem of menu.menuItemsInKitchens ?? []) {
			// Soft-deleted já filtrados no SQL (where acima).
			// Skip items without a task yet — created later by ensureProductionTasks.
			const taskRaw = menuItem.productionTaskInKitchens[0]
			if (!taskRaw) continue

			const recipeOrigin = menuItem.recipesInKitchen ? toWire<Record<string, unknown>>(menuItem.recipesInKitchen, RECIPE_RELATIONS) : null

			items.push({
				task: toWire<ProductionTask>(taskRaw),
				menuItem: {
					id: menuItem.id,
					recipe_origin_id: menuItem.recipeOriginId,
					planned_portion_quantity: menuItem.plannedPortionQuantity,
					recipe_origin: recipeOrigin,
					recipe_with_ingredients: recipeOrigin ? { ...recipeOrigin, ingredients: recipeOrigin.ingredients ?? [] } : null,
				},
				mealType,
			})
		}
	}

	return items
}

/**
 * Creates PENDING production_task records for all menu_items on a date that lack
 * one. Idempotent (onConflictDoNothing on UNIQUE menu_item_id). `created` é a
 * contagem REAL inserida (via RETURNING) — 0 numa 2ª chamada idempotente.
 */
export async function ensureProductionTasks(db: SisubDb, _ctx: UserContext, input: EnsureProductionTasks): Promise<{ created: number }> {
	const dailyMenus = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { id: true },
			with: { menuItemsInKitchens: { where: isNull(menuItemsInKitchen.deletedAt), columns: { id: true } } },
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
		})
	)

	const menuItemIds = dailyMenus.flatMap((menu) => (menu.menuItemsInKitchens ?? []).map((item) => item.id))
	if (menuItemIds.length === 0) return { created: 0 }

	const tasksToInsert = menuItemIds.map((menuItemId) => ({
		kitchenId: input.kitchenId,
		menuItemId,
		productionDate: input.date,
		status: "PENDING" as const,
	}))

	const inserted = await runQuery("INSERT_FAILED", () =>
		db
			.insert(productionTaskInKitchen)
			.values(tasksToInsert)
			.onConflictDoNothing({ target: productionTaskInKitchen.menuItemId })
			.returning({ id: productionTaskInKitchen.id })
	)

	return { created: inserted.length }
}

/** Transitions a production_task to a new status, managing timestamps. */
export async function updateProductionTaskStatus(db: SisubDb, _ctx: UserContext, input: UpdateProductionTaskStatus): Promise<ProductionTask> {
	const now = new Date().toISOString()

	const updates: { status: string; updatedAt: string; startedAt?: string | null; completedAt?: string | null } = { status: input.status, updatedAt: now }
	if (input.status === "IN_PROGRESS") {
		updates.startedAt = now
		updates.completedAt = null
	} else if (input.status === "DONE") {
		updates.completedAt = now
	} else if (input.status === "PENDING") {
		updates.startedAt = null
		updates.completedAt = null
	}

	const row = await insertOneOrFail("UPDATE_FAILED", `production_task ${input.taskId} not found`, () =>
		db.update(productionTaskInKitchen).set(updates).where(eq(productionTaskInKitchen.id, input.taskId)).returning()
	)
	return toWire<ProductionTask>(row)
}
