/**
 * @module production.fn
 * Kitchen production board: production_task lifecycle management.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: daily_menu, menu_items, production_task.
 * State machine: PENDING → IN_PROGRESS (sets started_at) → DONE (sets completed_at) → PENDING (clears both timestamps).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ProductionItem, ProductionTask, ProductionTaskStatus } from "@/types/domain/production"
import type { RecipeIngredientWithIngredient } from "@/types/domain/recipes"

// ---------------------------------------------------------------------------
// fetchProductionBoardFn
// ---------------------------------------------------------------------------

/**
 * Fetches ProductionItem[] for a kitchen on a date: menu_items with recipe_origin, ingredients and their production_task.
 *
 * @remarks
 * Only returns items that already have a production_task — call ensureProductionTasksFn first to create them.
 * Filters out deleted menu_items (deleted_at IS NOT NULL) in memory after fetch.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchProductionBoardFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number(), date: z.string() }))
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		const { data: dailyMenus, error } = await supabase
			.from("daily_menu")
			.select(
				`
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
      `
			)
			.eq("kitchen_id", data.kitchenId)
			.eq("service_date", data.date)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)

		const items: ProductionItem[] = []

		for (const menu of dailyMenus ?? []) {
			const mealType = Array.isArray(menu.meal_type) ? menu.meal_type[0] : menu.meal_type

			for (const menuItem of menu.menu_items ?? []) {
				// Ignorar itens deletados
				if (menuItem.deleted_at) continue

				const recipeOrigin = Array.isArray(menuItem.recipe_origin) ? menuItem.recipe_origin[0] : menuItem.recipe_origin
				const productionTaskRaw = Array.isArray(menuItem.production_task) ? menuItem.production_task[0] : menuItem.production_task

				// Se não há task ainda (antes do ensure), pula — será criada pelo ensureProductionTasksFn
				if (!productionTaskRaw) continue

				const task: ProductionTask = {
					id: productionTaskRaw.id,
					kitchen_id: productionTaskRaw.kitchen_id,
					menu_item_id: productionTaskRaw.menu_item_id,
					production_date: productionTaskRaw.production_date,
					status: productionTaskRaw.status as ProductionTaskStatus,
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
									ingredients: (recipeOrigin.ingredients ?? []) as RecipeIngredientWithIngredient[],
								}
							: null,
					} as unknown as ProductionItem["menuItem"],
					mealType: mealType ?? null,
				})
			}
		}

		return items
	})

// ---------------------------------------------------------------------------
// ensureProductionTasksFn
// ---------------------------------------------------------------------------

/**
 * Creates PENDING production_task records for all menu_items on a date that don't have one yet. Idempotent.
 *
 * @remarks
 * SIDE EFFECTS: upserts into production_task (conflict on UNIQUE menu_item_id, ignoreDuplicates=true).
 * Returns { created: n } where n is the attempted count (not only newly inserted rows).
 *
 * @throws {Error} on menu query or task upsert failure.
 */
export const ensureProductionTasksFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ kitchenId: z.number(), date: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		// 1. Buscar todos os menu_item_ids do dia para esta cozinha
		const { data: dailyMenus, error: menuError } = await supabase
			.from("daily_menu")
			.select("id, menu_items(id)")
			.eq("kitchen_id", data.kitchenId)
			.eq("service_date", data.date)
			.is("deleted_at", null)

		if (menuError) throw new Error(menuError.message)

		const menuItemIds: string[] = []
		for (const menu of dailyMenus ?? []) {
			for (const item of menu.menu_items ?? []) {
				menuItemIds.push(item.id)
			}
		}

		if (menuItemIds.length === 0) return { created: 0 }

		// 2. Inserir tasks PENDING — ignorar conflitos (já existentes)
		const tasksToInsert = menuItemIds.map((menuItemId) => ({
			kitchen_id: data.kitchenId,
			menu_item_id: menuItemId,
			production_date: data.date,
			status: "PENDING" as const,
		}))

		const { error: insertError } = await supabase.from("production_task").upsert(tasksToInsert, { onConflict: "menu_item_id", ignoreDuplicates: true })

		if (insertError) throw new Error(insertError.message)

		return { created: tasksToInsert.length }
	})

// ---------------------------------------------------------------------------
// updateProductionTaskStatusFn
// ---------------------------------------------------------------------------

/**
 * Transitions a production_task to a new status, managing timestamps per the state machine.
 *
 * @remarks
 * SIDE EFFECTS: updates production_task.status + updated_at always; additionally:
 *   IN_PROGRESS → sets started_at=now, clears completed_at.
 *   DONE → sets completed_at=now (started_at unchanged).
 *   PENDING → clears both started_at and completed_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateProductionTaskStatusFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			taskId: z.string(),
			status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		const now = new Date().toISOString()

		const updates: {
			status: string
			updated_at: string
			started_at?: string | null
			completed_at?: string | null
		} = {
			status: data.status,
			updated_at: now,
		}

		if (data.status === "IN_PROGRESS") {
			updates.started_at = now
			updates.completed_at = null
		} else if (data.status === "DONE") {
			updates.completed_at = now
		} else if (data.status === "PENDING") {
			updates.started_at = null
			updates.completed_at = null
		}

		const { data: result, error } = await supabase.from("production_task").update(updates).eq("id", data.taskId).select().single()

		if (error) throw new Error(error.message)

		return result as ProductionTask
	})
