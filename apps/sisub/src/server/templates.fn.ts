import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { Json } from "@/types/database.types"
import type { MenuTemplateWithItems, TemplateWithItemCounts } from "@/types/domain/planning"
import type {
	MenuTemplateInsert,
	MenuTemplateItemInsert,
	MenuTemplateUpdate,
} from "@/types/supabase.types"

const MenuTemplateWriteSchema = z.object({
	name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	base_template_id: z.string().nullable().optional(),
})

const MenuTemplateItemWriteSchema = z.object({
	day_of_week: z.number().nullable().optional(),
	meal_type_id: z.string().nullable().optional(),
	recipe_id: z.string().nullable().optional(),
	menu_template_id: z.string().nullable().optional(),
})

export const fetchMenuTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }): Promise<TemplateWithItemCounts[]> => {
		let query = getSupabaseServerClient()
			.from("menu_template")
			.select(`*, items:menu_template_items(count)`, { count: "exact" })
			.is("deleted_at", null)
			.order("name")

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)

		return (result || []).map((t) => ({
			...t,
			item_count: t.items?.[0]?.count || 0,
			recipe_count: t.items?.[0]?.count || 0,
		}))
	})

export const fetchDeletedTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }): Promise<TemplateWithItemCounts[]> => {
		let query = getSupabaseServerClient()
			.from("menu_template")
			.select(`*, items:menu_template_items(count)`, { count: "exact" })
			.not("deleted_at", "is", null)
			.order("deleted_at", { ascending: false })

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)

		return (result || []).map((t) => ({
			...t,
			item_count: t.items?.[0]?.count || 0,
			recipe_count: t.items?.[0]?.count || 0,
		}))
	})

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

export const fetchTemplateFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ templateId: z.string() }))
	.handler(async ({ data }): Promise<MenuTemplateWithItems | null> => {
		const supabase = getSupabaseServerClient()

		const { data: template, error: templateError } = await supabase
			.from("menu_template")
			.select("*")
			.eq("id", data.templateId)
			.single()

		if (templateError) throw new Error(templateError.message)

		const { data: items, error: itemsError } = await supabase
			.from("menu_template_items")
			.select(`*, recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", data.templateId)

		if (itemsError) throw new Error(itemsError.message)

		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return { ...template, items: (items || []) as any }
	})

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
			const { error: deleteError } = await supabase
				.from("menu_template_items")
				.delete()
				.eq("menu_template_id", data.id)

			if (deleteError) throw new Error(deleteError.message)

			if (data.items.length > 0) {
				const templateItems = data.items.map((item) => ({
					...(item as MenuTemplateItemInsert),
					menu_template_id: data.id,
				}))

				const { error: insertError } = await supabase
					.from("menu_template_items")
					.insert(templateItems)

				if (insertError) throw new Error(insertError.message)
			}
		}

		return result
	})

export const deleteTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("menu_template")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const restoreTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("menu_template")
			.update({ deleted_at: null })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

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

		if (fetchError || !templateItems)
			throw new Error(fetchError?.message ?? "Failed to fetch template items")

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

			for (const [mealTypeId, items] of Object.entries(itemsByMealType) as [
				string,
				(typeof dayItems)[number][],
			][]) {
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
