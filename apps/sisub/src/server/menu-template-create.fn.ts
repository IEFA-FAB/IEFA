/**
 * @module menu-template-create.fn
 * Template creation entrypoints: blank creation and fork (copy) from a base template.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: menu_template, menu_template_items.
 */

import type { MenuTemplateItemInsert } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ── Create blank template ─────────────────────────────────────────────────────

/**
 * Creates an empty menu template for a kitchen with no items.
 *
 * @remarks
 * SIDE EFFECTS: inserts menu_template with name, description, kitchen_id and template_type.
 *
 * @throws {Error} on Supabase insert failure.
 */
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

/**
 * Forks a base template into a kitchen-local copy, recording base_template_id and duplicating all items.
 *
 * @remarks
 * SIDE EFFECTS: inserts menu_template (with base_template_id FK) then menu_template_items (day_of_week, meal_type_id, recipe_id copied).
 * headcount_override is NOT copied from base items.
 * On any failure after template creation, hard-deletes the template row (no DB transaction).
 *
 * @throws {Error} on template insert, items fetch or items insert failure (rollback attempted).
 */
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
