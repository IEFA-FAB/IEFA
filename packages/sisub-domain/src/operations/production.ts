/**
 * Kitchen production-board operations: production_task lifecycle.
 *
 * Auth posture preserved from the original server functions: authenticated
 * entrypoints with no module-level PBAC guard.
 *
 * State machine: PENDING -> IN_PROGRESS (sets started_at) -> DONE (sets
 * completed_at) -> PENDING (clears both timestamps).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { EnsureProductionTasks, FetchProductionBoard, UpdateProductionTaskStatus } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

const PRODUCTION_BOARD_SELECT = `
        id,
        meal_type_id,
        forecasted_headcount,
        meal_type:meal_type_id(id, name, sort_order),
        menu_items(
          id,
          recipe_origin_id,
          planned_portion_quantity,
          recipe,
          deleted_at,
          recipe_origin:recipe_origin_id(
            id,
            name,
            portion_yield,
            preparation_method,
            preparation_time_minutes,
            kitchen_id,
            ingredients:recipe_ingredients(
              id,
              net_quantity,
              priority_order,
              is_optional,
              ingredient:ingredient_id(id, description, measure_unit)
            )
          ),
          production_task(id, status, started_at, completed_at, notes, updated_at, created_at, kitchen_id, menu_item_id, production_date)
        )
      ` as const

/**
 * Returns production items for a kitchen on a date. Only items that already have
 * a production_task are returned — call ensureProductionTasks first to create them.
 */
export async function fetchProductionBoard(client: AnyClient, _ctx: UserContext, input: FetchProductionBoard) {
	const { data: dailyMenus, error } = await client
		.from("daily_menu")
		.select(PRODUCTION_BOARD_SELECT)
		.eq("kitchen_id", input.kitchenId)
		.eq("service_date", input.date)
		.is("deleted_at", null)

	if (error) throw new DomainError("FETCH_FAILED", error.message)

	const items: unknown[] = []

	for (const menu of dailyMenus ?? []) {
		const mealType = Array.isArray(menu.meal_type) ? menu.meal_type[0] : menu.meal_type

		for (const menuItem of menu.menu_items ?? []) {
			if (menuItem.deleted_at) continue

			const recipeOrigin = Array.isArray(menuItem.recipe_origin) ? menuItem.recipe_origin[0] : menuItem.recipe_origin
			const productionTaskRaw = Array.isArray(menuItem.production_task) ? menuItem.production_task[0] : menuItem.production_task

			// Skip items without a task yet — created later by ensureProductionTasks.
			if (!productionTaskRaw) continue

			const task = {
				id: productionTaskRaw.id,
				kitchen_id: productionTaskRaw.kitchen_id,
				menu_item_id: productionTaskRaw.menu_item_id,
				production_date: productionTaskRaw.production_date,
				status: productionTaskRaw.status,
				started_at: productionTaskRaw.started_at ?? null,
				completed_at: productionTaskRaw.completed_at ?? null,
				notes: productionTaskRaw.notes ?? null,
				created_at: productionTaskRaw.created_at,
				updated_at: productionTaskRaw.updated_at ?? null,
			}

			items.push({
				task,
				menuItem: {
					id: menuItem.id,
					recipe_origin_id: menuItem.recipe_origin_id,
					planned_portion_quantity: menuItem.planned_portion_quantity,
					recipe_origin: recipeOrigin ?? null,
					recipe_with_ingredients: recipeOrigin
						? {
								...recipeOrigin,
								ingredients: recipeOrigin.ingredients ?? [],
							}
						: null,
				},
				mealType: mealType ?? null,
			})
		}
	}

	return items
}

/**
 * Creates PENDING production_task records for all menu_items on a date that lack
 * one. Idempotent (upsert ignoreDuplicates on UNIQUE menu_item_id).
 */
export async function ensureProductionTasks(client: AnyClient, _ctx: UserContext, input: EnsureProductionTasks) {
	const { data: dailyMenus, error: menuError } = await client
		.from("daily_menu")
		.select("id, menu_items(id)")
		.eq("kitchen_id", input.kitchenId)
		.eq("service_date", input.date)
		.is("deleted_at", null)

	if (menuError) throw new DomainError("FETCH_FAILED", menuError.message)

	const menuItemIds: string[] = []
	for (const menu of dailyMenus ?? []) {
		for (const item of menu.menu_items ?? []) {
			menuItemIds.push(item.id)
		}
	}

	if (menuItemIds.length === 0) return { created: 0 }

	const tasksToInsert = menuItemIds.map((menuItemId) => ({
		kitchen_id: input.kitchenId,
		menu_item_id: menuItemId,
		production_date: input.date,
		status: "PENDING" as const,
	}))

	const { error: insertError } = await client.from("production_task").upsert(tasksToInsert, { onConflict: "menu_item_id", ignoreDuplicates: true })

	if (insertError) throw new DomainError("INSERT_FAILED", insertError.message)

	return { created: tasksToInsert.length }
}

/** Transitions a production_task to a new status, managing timestamps. */
export async function updateProductionTaskStatus(client: AnyClient, _ctx: UserContext, input: UpdateProductionTaskStatus) {
	const now = new Date().toISOString()

	const updates: {
		status: string
		updated_at: string
		started_at?: string | null
		completed_at?: string | null
	} = {
		status: input.status,
		updated_at: now,
	}

	if (input.status === "IN_PROGRESS") {
		updates.started_at = now
		updates.completed_at = null
	} else if (input.status === "DONE") {
		updates.completed_at = now
	} else if (input.status === "PENDING") {
		updates.started_at = null
		updates.completed_at = null
	}

	const { data, error } = await client.from("production_task").update(updates).eq("id", input.taskId).select().single()

	if (error) throw new DomainError("UPDATE_FAILED", error.message)

	return data
}
