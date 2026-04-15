/**
 * @module templates.fn
 * Menu template (weekly/event) CRUD and stamping onto the planning board.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: menu_template, menu_template_items, daily_menu, menu_items.
 * Scope: kitchenId=null → global templates (SDAB only); non-null → global + kitchen-specific templates.
 */

import type { Json } from "@iefa/database"
import type { MenuTemplateInsert, MenuTemplateItemInsert, MenuTemplateUpdate } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MenuTemplateWithItems, TemplateWithItemCounts } from "@/types/domain/planning"

const MenuTemplateWriteSchema = z.object({
	name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	base_template_id: z.string().nullable().optional(),
	template_type: z.enum(["weekly", "event"]).optional(),
})

const MenuTemplateItemWriteSchema = z.object({
	day_of_week: z.number().nullable().optional(),
	meal_type_id: z.string().nullable().optional(),
	recipe_id: z.string().nullable().optional(),
	menu_template_id: z.string().nullable().optional(),
	headcount_override: z.number().nullable().optional(),
})

/**
 * Lists active templates visible to a kitchen scope, computing item_count, headcount_filled and avg_headcount_weekday (Mon–Thu, day_of_week 1–4).
 *
 * @remarks
 * kitchenId=null → global templates only; non-null → global OR matching kitchen (PostgREST OR filter).
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMenuTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }): Promise<TemplateWithItemCounts[]> => {
		let query = getSupabaseServerClient()
			.from("menu_template")
			.select(`*, items:menu_template_items(headcount_override, day_of_week)`)
			.is("deleted_at", null)
			.order("name")

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)

		return (result || []).map((t) => {
			const items = (t.items as { headcount_override: number | null; day_of_week: number | null }[]) || []
			const item_count = items.length
			const headcount_filled = items.filter((i) => i.headcount_override !== null).length

			// Média de comensais Seg–Qui (day_of_week 1–4), refeições mais volumosas
			const weekdayItems = items.filter((i) => i.day_of_week !== null && i.day_of_week >= 1 && i.day_of_week <= 4 && i.headcount_override !== null)
			const avg_headcount_weekday =
				weekdayItems.length > 0 ? Math.round(weekdayItems.reduce((sum, i) => sum + (i.headcount_override ?? 0), 0) / weekdayItems.length) : null

			return {
				...t,
				item_count,
				recipe_count: item_count,
				headcount_filled,
				avg_headcount_weekday,
			}
		})
	})

/**
 * Lists soft-deleted templates for a kitchen scope, ordered by deletion date descending.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchDeletedTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }): Promise<TemplateWithItemCounts[]> => {
		let query = getSupabaseServerClient()
			.from("menu_template")
			.select(`*, items:menu_template_items(headcount_override, day_of_week)`)
			.not("deleted_at", "is", null)
			.order("deleted_at", { ascending: false })

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)

		return (result || []).map((t) => {
			const items = (t.items as { headcount_override: number | null; day_of_week: number | null }[]) || []
			const item_count = items.length
			const headcount_filled = items.filter((i) => i.headcount_override !== null).length
			const weekdayItems = items.filter((i) => i.day_of_week !== null && i.day_of_week >= 1 && i.day_of_week <= 4 && i.headcount_override !== null)
			const avg_headcount_weekday =
				weekdayItems.length > 0 ? Math.round(weekdayItems.reduce((sum, i) => sum + (i.headcount_override ?? 0), 0) / weekdayItems.length) : null
			return { ...t, item_count, recipe_count: item_count, headcount_filled, avg_headcount_weekday }
		})
	})

/**
 * Fetches all items for a template with meal_type and recipe_origin relations, ordered by day_of_week then meal_type_id.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchTemplateItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ templateId: z.string() }))
	.handler(async ({ data }): Promise<MenuTemplateWithItems["items"]> => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("menu_template_items")
			.select(`*, meal_type:meal_type_id(*), recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", data.templateId)
			.order("day_of_week")
			.order("meal_type_id")

		if (error) throw new Error(error.message)
		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return (result || []) as any
	})

/**
 * Fetches a single template with its items and recipe_origin relations.
 *
 * @throws {Error} on template not found (Supabase .single() error) or items query failure.
 */
export const fetchTemplateFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ templateId: z.string() }))
	.handler(async ({ data }): Promise<MenuTemplateWithItems | null> => {
		const supabase = getSupabaseServerClient()

		const { data: template, error: templateError } = await supabase.from("menu_template").select("*").eq("id", data.templateId).single()

		if (templateError) throw new Error(templateError.message)

		const { data: items, error: itemsError } = await supabase
			.from("menu_template_items")
			.select(`*, recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", data.templateId)

		if (itemsError) throw new Error(itemsError.message)

		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return { ...template, items: (items || []) as any }
	})

/**
 * Creates a template and its items — rolls back the template (hard delete) if item insertion fails.
 *
 * @remarks
 * SIDE EFFECTS: inserts menu_template then menu_template_items; on item error, hard-deletes the inserted template.
 * Partial rollback only (no DB transaction). Succeeds cleanly if items array is empty.
 *
 * @throws {Error} on template or item insert failure (rollback attempted but not guaranteed).
 */
export const createTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			template: MenuTemplateWriteSchema,
			items: z.array(MenuTemplateItemWriteSchema),
		})
	)
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		const { data: newTemplate, error: templateError } = await supabase
			.from("menu_template")
			.insert(data.template as MenuTemplateInsert)
			.select()
			.single()

		if (templateError) throw new Error(templateError.message)

		if (data.items.length > 0) {
			const templateItems = data.items.map((item) => ({
				...(item as MenuTemplateItemInsert),
				menu_template_id: newTemplate.id,
			}))

			const { error: itemsError } = await supabase.from("menu_template_items").insert(templateItems)

			if (itemsError) {
				await supabase.from("menu_template").delete().eq("id", newTemplate.id)
				throw new Error(itemsError.message)
			}
		}

		return newTemplate
	})

/**
 * Updates a template's metadata and optionally replaces all its items via delete-all + re-insert.
 *
 * @remarks
 * SIDE EFFECTS: when items is provided (even empty array), DELETES all existing menu_template_items before inserting new ones — destructive replacement.
 * items=undefined → metadata-only update, existing items untouched.
 *
 * @throws {Error} on any Supabase operation failure.
 */
export const updateTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			updates: MenuTemplateWriteSchema,
			items: z.array(MenuTemplateItemWriteSchema).optional(),
		})
	)
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		const { data: result, error: templateError } = await supabase
			.from("menu_template")
			.update(data.updates as MenuTemplateUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (templateError) throw new Error(templateError.message)

		if (data.items !== undefined) {
			const { error: deleteError } = await supabase.from("menu_template_items").delete().eq("menu_template_id", data.id)

			if (deleteError) throw new Error(deleteError.message)

			if (data.items.length > 0) {
				const templateItems = data.items.map((item) => ({
					...(item as MenuTemplateItemInsert),
					menu_template_id: data.id,
				}))

				const { error: insertError } = await supabase.from("menu_template_items").insert(templateItems)

				if (insertError) throw new Error(insertError.message)
			}
		}

		return result
	})

/**
 * Soft-deletes a template by setting deleted_at — items remain intact and recoverable via restoreTemplateFn.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("menu_template").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

/**
 * Restores a soft-deleted template by clearing deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const restoreTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("menu_template").update({ deleted_at: null }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

/**
 * Stamps a template onto a set of calendar dates, mapping template days to dates via startDayOfWeek offset.
 *
 * @remarks
 * SIDE EFFECTS: soft-deletes ALL existing daily_menus for (targetDates × kitchenId) before creating new records.
 *   Inserts daily_menu (one per meal_type per date) and menu_items using crypto.randomUUID(). No DB transaction.
 * Day mapping: jsDay → templateDay via ((jsDay - startDayOfWeek + 7) % 7) + 1. Sunday is treated as 7, not 0.
 * Items with null meal_type_id are silently skipped.
 *
 * @throws {Error} on template fetch, soft-delete, daily_menu insert, or menu_items insert failure.
 */
export const applyTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			templateId: z.string(),
			targetDates: z.array(z.string()),
			startDayOfWeek: z.number(),
			kitchenId: z.number(),
		})
	)
	.handler(async ({ data }): Promise<{ menusCreated: number; itemsCreated: number }> => {
		const supabase = getSupabaseServerClient()
		const { templateId, targetDates, startDayOfWeek, kitchenId } = data

		const { data: templateItems, error: fetchError } = await supabase
			.from("menu_template_items")
			.select(`*, recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", templateId)

		if (fetchError || !templateItems) throw new Error(fetchError?.message ?? "Failed to fetch template items")

		const { error: deleteError } = await supabase
			.from("daily_menu")
			.update({ deleted_at: new Date().toISOString() })
			.in("service_date", targetDates)
			.eq("kitchen_id", kitchenId)

		if (deleteError) throw new Error(deleteError.message)

		const newMenus: Array<{
			id: string
			service_date: string
			meal_type_id: string
			kitchen_id: number
			status: string
		}> = []
		const newMenuItems: Array<{
			daily_menu_id: string
			recipe_origin_id: string
			recipe: Json
		}> = []

		for (const dateStr of targetDates) {
			const date = new Date(dateStr)
			const jsDay = date.getDay()
			const dateDayOfWeek = jsDay === 0 ? 7 : jsDay
			const offset = dateDayOfWeek - startDayOfWeek
			const templateDay = ((offset + 7) % 7) + 1

			const dayItems = templateItems.filter((item) => item.day_of_week === templateDay)
			const itemsByMealType = dayItems.reduce(
				(acc, item) => {
					const key = item.meal_type_id ?? "__null__"
					if (!acc[key]) acc[key] = []
					acc[key].push(item)
					return acc
				},
				{} as Record<string, typeof dayItems>
			)

			for (const [mealTypeId, items] of Object.entries(itemsByMealType) as [string, (typeof dayItems)[number][]][]) {
				if (mealTypeId === "__null__") continue
				const menuId = crypto.randomUUID()
				newMenus.push({
					id: menuId,
					service_date: dateStr,
					meal_type_id: mealTypeId,
					kitchen_id: kitchenId,
					status: "PLANNED",
				})
				for (const item of items) {
					newMenuItems.push({
						daily_menu_id: menuId,
						recipe_origin_id: item.recipe_id ?? "",
						recipe: item.recipe_origin as Json,
					})
				}
			}
		}

		if (newMenus.length > 0) {
			const { error } = await supabase.from("daily_menu").insert(newMenus)
			if (error) throw new Error(error.message)
		}

		if (newMenuItems.length > 0) {
			const { error } = await supabase.from("menu_items").insert(newMenuItems)
			if (error) throw new Error(error.message)
		}

		return { menusCreated: newMenus.length, itemsCreated: newMenuItems.length }
	})
