import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { supabaseServer } from "@/lib/supabase.server"
import type { DailyMenuInsert, DailyMenuWithItems, MenuItemInsert } from "@/types/domain/planning"

const dailyMenuSelect = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(
    *,
    recipe_origin:recipe_origin_id(*)
  )
` as const

export const fetchDailyMenusFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			kitchenId: z.number(),
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", data.kitchenId)
			.gte("service_date", data.startDate)
			.lte("service_date", data.endDate)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)

		return (result ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items || []).filter((item: any) => !item.deleted_at),
		})) as DailyMenuWithItems[]
	})

export const fetchDayDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number(), date: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", data.kitchenId)
			.eq("service_date", data.date)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)

		return (result ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items || []).filter((item: any) => !item.deleted_at),
		})) as DailyMenuWithItems[]
	})

export const upsertDailyMenuFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ menus: z.array(z.record(z.unknown())) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
			.from("daily_menu")
			.upsert(data.menus as DailyMenuInsert[], {
				onConflict: "service_date,meal_type_id,kitchen_id",
				ignoreDuplicates: true,
			})
			.select()

		if (error) throw new Error(error.message)
		return result
	})

export const addMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ item: z.record(z.unknown()) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
			.from("menu_items")
			.insert(data.item as MenuItemInsert)
			.select()

		if (error) throw new Error(error.message)
		return result
	})

export const updateDailyMenuFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			updates: z.object({ forecasted_headcount: z.number().nullable().optional() }),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
			.from("daily_menu")
			.update(data.updates)
			.eq("id", data.id)
			.select()

		if (error) throw new Error(error.message)
		return result
	})

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
		const { data: result, error } = await supabaseServer
			.from("menu_items")
			.update(data.updates)
			.eq("id", data.id)
			.select()

		if (error) throw new Error(error.message)
		return result
	})

export const softDeleteMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await supabaseServer
			.from("menu_items")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const restoreMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await supabaseServer
			.from("menu_items")
			.update({ deleted_at: null })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const fetchTrashItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
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

export const fetchTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await supabaseServer
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
