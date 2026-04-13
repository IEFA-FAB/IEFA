import type { MenuTemplateItemInsert } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ── Create blank template ─────────────────────────────────────────────────────

export const createBlankTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			name: z.string().min(1),
			description: z.string().nullable(),
			kitchenId: z.number(),
			templateType: z.enum(["weekly", "event"]),
		})
	)
	.handler(async ({ data }) => {
		const { data: template, error } = await getSupabaseServerClient()
			.from("menu_template")
			.insert({
				name: data.name,
				description: data.description,
				kitchen_id: data.kitchenId,
				template_type: data.templateType,
			})
			.select()
			.single()

		if (error) throw new Error(error.message)
		return template
	})

// ── Fork (adapt) a base template ─────────────────────────────────────────────

export const forkTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			name: z.string().min(1),
			description: z.string().nullable(),
			kitchenId: z.number(),
			baseTemplateId: z.string(),
			templateType: z.enum(["weekly", "event"]),
		})
	)
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		// 1. Create local template referencing the base
		const { data: newTemplate, error: templateError } = await supabase
			.from("menu_template")
			.insert({
				name: data.name,
				description: data.description,
				kitchen_id: data.kitchenId,
				base_template_id: data.baseTemplateId,
				template_type: data.templateType,
			})
			.select()
			.single()

		if (templateError) throw new Error(templateError.message)

		// 2. Copy items from base template
		const { data: baseItems, error: itemsError } = await supabase
			.from("menu_template_items")
			.select("day_of_week, meal_type_id, recipe_id")
			.eq("menu_template_id", data.baseTemplateId)

		if (itemsError) {
			await supabase.from("menu_template").delete().eq("id", newTemplate.id)
			throw new Error(itemsError.message)
		}

		if (baseItems && baseItems.length > 0) {
			const forkedItems: MenuTemplateItemInsert[] = baseItems.map((item) => ({
				menu_template_id: newTemplate.id,
				day_of_week: item.day_of_week,
				meal_type_id: item.meal_type_id,
				recipe_id: item.recipe_id,
			}))

			const { error: insertError } = await supabase.from("menu_template_items").insert(forkedItems)

			if (insertError) {
				await supabase.from("menu_template").delete().eq("id", newTemplate.id)
				throw new Error(insertError.message)
			}
		}

		return newTemplate
	})
