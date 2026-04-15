/**
 * @module planning.fn
 * Planning board CRUD: daily_menu and menu_items management, plus template stamping.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: daily_menu, menu_items, menu_template, menu_template_items.
 * Soft-delete pattern: deleted_at IS NULL = active; non-null = trashed.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { DailyMenuInsert, DailyMenuWithItems, MenuItemInsert } from "@/types/domain/planning"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

const DailyMenuUpsertItemSchema = z.object({
	id: z.string().optional(),
	kitchen_id: z.number().nullable().optional(),
	meal_type_id: z.string().nullable().optional(),
	service_date: z.string().nullable().optional(),
	status: z.string().nullable().optional(),
	forecasted_headcount: z.number().nullable().optional(),
})

const MenuItemInsertSchema = z.object({
	daily_menu_id: z.string().nullable().optional(),
	recipe_origin_id: z.string().nullable().optional(),
	recipe: z.custom<RecipeWithIngredients>().nullable().optional(),
	planned_portion_quantity: z.number().nullable().optional(),
	excluded_from_procurement: z.number().nullable().optional(),
})

const dailyMenuSelect = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(
    *,
    recipe_origin:recipe_origin_id(*)
  )
` as const

/**
 * Fetches daily menus for a kitchen in a date range with their menu_items, filtering trashed items in memory (not via DB query).
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchDailyMenusFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			kitchenId: z.number(),
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", data.kitchenId)
			.gte("service_date", data.startDate)
			.lte("service_date", data.endDate)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)

		return (result ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items || []).filter((item) => !item.deleted_at),
		})) as DailyMenuWithItems[]
	})

/**
 * Fetches all daily menus for a single date in a kitchen, filtering trashed items in memory.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchDayDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number(), date: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", data.kitchenId)
			.eq("service_date", data.date)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)

		return (result ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items || []).filter((item) => !item.deleted_at),
		})) as DailyMenuWithItems[]
	})

/**
 * Upserts daily menus with ignoreDuplicates=true — conflicts on (service_date, meal_type_id, kitchen_id) are silently skipped.
 *
 * @throws {Error} on Supabase upsert failure.
 */
export const upsertDailyMenuFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ menus: z.array(DailyMenuUpsertItemSchema) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("daily_menu")
			.upsert(data.menus as DailyMenuInsert[], {
				onConflict: "service_date,meal_type_id,kitchen_id",
				ignoreDuplicates: true,
			})
			.select()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Inserts a single menu_item into an existing daily_menu.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const addMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ item: MenuItemInsertSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("menu_items")
			.insert(data.item as MenuItemInsert)
			.select()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Patches a daily_menu record (currently only forecasted_headcount).
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateDailyMenuFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			updates: z.object({ forecasted_headcount: z.number().nullable().optional() }),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("daily_menu").update(data.updates).eq("id", data.id).select()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Patches a menu_item's planned_portion_quantity or excluded_from_procurement flag (0 = included, 1 = excluded).
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			updates: z.object({
				planned_portion_quantity: z.number().nullable().optional(),
				excluded_from_procurement: z.number().nullable().optional(),
			}),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("menu_items").update(data.updates).eq("id", data.id).select()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Replaces the substitutions JSON map on a menu_item — full overwrite, not a merge.
 *
 * @remarks
 * SIDE EFFECTS: overwrites menu_items.substitutions (JSON column) entirely.
 * Key format: { [ingredientId]: { type: string, rationale: string, updated_at: ISO string } }.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateSubstitutionsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			substitutions: z.record(z.string(), z.object({ type: z.string(), rationale: z.string(), updated_at: z.string() })),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("menu_items")
			// biome-ignore lint/suspicious/noExplicitAny: Supabase Json column requires any cast
			.update({ substitutions: data.substitutions as any })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

/**
 * Moves a menu_item to trash by setting deleted_at to now (recoverable via restoreMenuItemFn).
 *
 * @throws {Error} on Supabase update failure.
 */
export const softDeleteMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

/**
 * Restores a trashed menu_item by clearing deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const restoreMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("menu_items").update({ deleted_at: null }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

/**
 * Lists all trashed menu_items for a kitchen (deleted_at IS NOT NULL), ordered by deletion date descending.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchTrashItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("menu_items")
			.select(
				`
        *,
        recipe_origin:recipe_origin_id(*),
        daily_menu!inner(*)
      `
			)
			.not("deleted_at", "is", null)
			.eq("daily_menu.kitchen_id", data.kitchenId)
			.order("deleted_at", { ascending: false })

		if (error) throw new Error(error.message)
		return result ?? []
	})

/**
 * Lists menu_templates for a kitchen with full items and recipe_origin. Does not filter by deleted_at.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("menu_template")
			.select(
				`
        *,
        items:menu_template_items(
          *,
          recipe_origin:recipe_origin_id(*)
        )
      `
			)
			.eq("kitchen_id", data.kitchenId)

		if (error) throw new Error(error.message)
		return result ?? []
	})
