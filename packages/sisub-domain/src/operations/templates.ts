/**
 * Template operations — canonical implementation.
 *
 * Bug fix vs sisub:
 *   - applyTemplate: full rollback (restore previously deleted menus ON ERROR)
 *     was missing in sisub — only sisub-mcp had correct rollback.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import { validateTemplateAccess } from "../guards/validate-scope.ts"
import type {
	ApplyTemplate,
	CreateBlankTemplate,
	CreateTemplate,
	DeleteTemplate,
	ForkTemplate,
	GetTemplate,
	ListTemplates,
	RestoreTemplate,
	TemplateItem,
	UpdateTemplate,
} from "../schemas/templates.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

const TEMPLATE_ITEMS_FULL = `
  *,
  meal_type:meal_type_id(*),
  recipe_origin:recipe_id(*)
` as const

function mapTemplateWithCounts(
	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	t: any
): Record<string, unknown> {
	const items = (t.items as { headcount_override: number | null; day_of_week: number | null }[]) || []
	const item_count = items.length
	const headcount_filled = items.filter((i) => i.headcount_override !== null).length
	const weekdayItems = items.filter((i) => i.day_of_week !== null && i.day_of_week >= 1 && i.day_of_week <= 4 && i.headcount_override !== null)
	const avg_headcount_weekday =
		weekdayItems.length > 0 ? Math.round(weekdayItems.reduce((sum, i) => sum + (i.headcount_override ?? 0), 0) / weekdayItems.length) : null
	return { ...t, item_count, recipe_count: item_count, headcount_filled, avg_headcount_weekday }
}

export async function listTemplates(client: AnyClient, ctx: UserContext, input: ListTemplates) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	let query = client.from("menu_template").select(`*, items:menu_template_items(headcount_override, day_of_week)`).is("deleted_at", null).order("name")

	if (input.kitchenId != null) {
		query = query.or(`kitchen_id.is.null,kitchen_id.eq.${input.kitchenId}`)
	} else {
		query = query.is("kitchen_id", null)
	}

	const { data, error } = await query
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return (data ?? []).map(mapTemplateWithCounts)
}

export async function listDeletedTemplates(client: AnyClient, ctx: UserContext, input: ListTemplates) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	let query = client
		.from("menu_template")
		.select(`*, items:menu_template_items(headcount_override, day_of_week)`)
		.not("deleted_at", "is", null)
		.order("deleted_at", { ascending: false })

	if (input.kitchenId != null) {
		query = query.or(`kitchen_id.is.null,kitchen_id.eq.${input.kitchenId}`)
	} else {
		query = query.is("kitchen_id", null)
	}

	const { data, error } = await query
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return (data ?? []).map(mapTemplateWithCounts)
}

export async function getTemplate(client: AnyClient, ctx: UserContext, input: GetTemplate) {
	const template = await validateTemplateAccess(client, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 1, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const { data: items, error } = await client
		.from("menu_template_items")
		.select(TEMPLATE_ITEMS_FULL)
		.eq("menu_template_id", input.templateId)
		.order("day_of_week")
		.order("meal_type_id")

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return { ...template, items: items ?? [] }
}

export async function getTemplateItems(client: AnyClient, ctx: UserContext, input: GetTemplate) {
	const template = await validateTemplateAccess(client, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 1, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const { data, error } = await client
		.from("menu_template_items")
		.select(TEMPLATE_ITEMS_FULL)
		.eq("menu_template_id", input.templateId)
		.order("day_of_week")
		.order("meal_type_id")

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

function buildTemplateItemRows(templateId: string, items: TemplateItem[]) {
	return items.map((item) => ({
		menu_template_id: templateId,
		day_of_week: item.dayOfWeek,
		meal_type_id: item.mealTypeId,
		recipe_id: item.recipeId,
		...(item.headcountOverride != null && { headcount_override: item.headcountOverride }),
	}))
}

export async function createTemplate(client: AnyClient, ctx: UserContext, input: CreateTemplate) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { data: newTemplate, error: templateError } = await client
		.from("menu_template")
		.insert({
			name: input.name,
			description: input.description ?? null,
			kitchen_id: input.kitchenId ?? null,
			template_type: input.templateType,
		})
		.select()
		.single()

	if (templateError) throw new DomainError("INSERT_FAILED", templateError.message)

	const items = input.items ?? []
	if (items.length > 0) {
		const rows = buildTemplateItemRows(newTemplate.id, items)
		const { error: itemsError } = await client.from("menu_template_items").insert(rows)
		if (itemsError) {
			// Rollback: hard-delete the template
			await client.from("menu_template").delete().eq("id", newTemplate.id)
			throw new DomainError("INSERT_ITEMS_FAILED", itemsError.message)
		}
	}

	return newTemplate
}

export async function createBlankTemplate(client: AnyClient, ctx: UserContext, input: CreateBlankTemplate) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { data, error } = await client
		.from("menu_template")
		.insert({
			name: input.name,
			description: input.description ?? null,
			kitchen_id: input.kitchenId ?? null,
			template_type: input.templateType,
		})
		.select()
		.single()

	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function forkTemplate(client: AnyClient, ctx: UserContext, input: ForkTemplate) {
	// Check read access on source template
	const source = await validateTemplateAccess(client, input.sourceTemplateId, null)
	if (source.kitchen_id !== null) {
		requireKitchen(ctx, 1, source.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const targetKitchenId = input.targetKitchenId ?? null

	if (targetKitchenId !== null) {
		requireKitchen(ctx, 2, targetKitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	// Fetch source items
	const { data: sourceItems, error: itemsFetchError } = await client
		.from("menu_template_items")
		.select("day_of_week, meal_type_id, recipe_id")
		.eq("menu_template_id", input.sourceTemplateId)

	if (itemsFetchError) throw new DomainError("FETCH_FAILED", itemsFetchError.message)

	// Create fork
	const { data: newTemplate, error: templateError } = await client
		.from("menu_template")
		.insert({
			name: input.newName ?? source.name,
			kitchen_id: targetKitchenId,
			base_template_id: input.sourceTemplateId,
			// biome-ignore lint/suspicious/noExplicitAny: source row is untyped
			template_type: (source as any).template_type ?? "weekly",
		})
		.select()
		.single()

	if (templateError) throw new DomainError("INSERT_FAILED", templateError.message)

	if (sourceItems && sourceItems.length > 0) {
		const forkedItems = sourceItems.map((item) => ({
			menu_template_id: newTemplate.id,
			day_of_week: item.day_of_week,
			meal_type_id: item.meal_type_id,
			recipe_id: item.recipe_id,
		}))

		const { error: insertError } = await client.from("menu_template_items").insert(forkedItems)
		if (insertError) {
			await client.from("menu_template").delete().eq("id", newTemplate.id)
			throw new DomainError("INSERT_ITEMS_FAILED", insertError.message)
		}
	}

	return newTemplate
}

export async function updateTemplate(client: AnyClient, ctx: UserContext, input: UpdateTemplate) {
	const template = await validateTemplateAccess(client, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 2, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const updates: Record<string, unknown> = {}
	if (input.name != null) updates.name = input.name
	if (input.description != null) updates.description = input.description
	if (input.templateType != null) updates.template_type = input.templateType

	const { data: result, error: updateError } = await client
		.from("menu_template")
		// biome-ignore lint/suspicious/noExplicitAny: dynamic update object
		.update(updates as any)
		.eq("id", input.templateId)
		.select()
		.single()

	if (updateError) throw new DomainError("UPDATE_FAILED", updateError.message)

	// Destructive item replacement if items provided
	if (input.items !== undefined) {
		const { error: deleteError } = await client.from("menu_template_items").delete().eq("menu_template_id", input.templateId)
		if (deleteError) throw new DomainError("DELETE_ITEMS_FAILED", deleteError.message)

		if (input.items.length > 0) {
			const rows = buildTemplateItemRows(input.templateId, input.items)
			const { error: insertError } = await client.from("menu_template_items").insert(rows)
			if (insertError) throw new DomainError("INSERT_ITEMS_FAILED", insertError.message)
		}
	}

	return result
}

export async function deleteTemplate(client: AnyClient, ctx: UserContext, input: DeleteTemplate) {
	const template = await validateTemplateAccess(client, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 2, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { error } = await client.from("menu_template").update({ deleted_at: new Date().toISOString() }).eq("id", input.templateId)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function restoreTemplate(client: AnyClient, ctx: UserContext, input: RestoreTemplate) {
	const { data, error: fetchError } = await client.from("menu_template").select("id, kitchen_id, deleted_at").eq("id", input.templateId).single()

	if (fetchError || !data) throw new NotFoundError("menu_template", input.templateId)
	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	const row = data as any
	if (!row.deleted_at) throw new DomainError("NOT_DELETED", "Template is not deleted")

	if (row.kitchen_id !== null) {
		requireKitchen(ctx, 2, row.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { error } = await client.from("menu_template").update({ deleted_at: null }).eq("id", input.templateId)
	if (error) throw new DomainError("RESTORE_FAILED", error.message)
}

export async function applyTemplate(
	client: AnyClient,
	ctx: UserContext,
	input: ApplyTemplate
): Promise<{ menusCreated: number; itemsCreated: number; datesProcessed: string[] }> {
	requireKitchen(ctx, 2, input.kitchenId)

	// Validate template: not deleted, kitchen matches (throws if not accessible)
	await validateTemplateAccess(client, input.templateId, input.kitchenId)

	// Fetch template items
	const { data: templateItems, error: fetchError } = await client
		.from("menu_template_items")
		.select("*, recipe_origin:recipe_id(*)")
		.eq("menu_template_id", input.templateId)

	if (fetchError || !templateItems) throw new DomainError("FETCH_FAILED", fetchError?.message ?? "Failed to fetch template items")

	// Compute date range
	const targetDates: string[] = []
	const start = new Date(input.startDate)
	const end = new Date(input.endDate)
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		targetDates.push(d.toISOString().slice(0, 10))
	}

	// Soft-delete existing menus (save IDs for rollback)
	const { data: deletedMenus, error: deleteError } = await client
		.from("daily_menu")
		.update({ deleted_at: new Date().toISOString() })
		.in("service_date", targetDates)
		.eq("kitchen_id", input.kitchenId)
		.select("id")

	if (deleteError) throw new DomainError("DELETE_FAILED", deleteError.message)

	async function rollback(): Promise<void> {
		if (!deletedMenus?.length) return
		const ids = deletedMenus.map((m: { id: string }) => m.id)
		await client.from("daily_menu").update({ deleted_at: null }).in("id", ids)
	}

	// Build new menus and items
	const newMenus: Array<{ id: string; service_date: string; meal_type_id: string; kitchen_id: number; status: string }> = []
	const newMenuItems: Array<{ daily_menu_id: string; recipe_origin_id: string; recipe: unknown }> = []

	for (const dateStr of targetDates) {
		const jsDay = new Date(dateStr).getDay()
		const dateDayOfWeek = jsDay === 0 ? 7 : jsDay
		const templateDay = ((dateDayOfWeek - input.startDayOfWeek + 7) % 7) + 1

		const itemsByMealType: Record<string, typeof templateItems> = {}
		for (const item of templateItems.filter((i: { day_of_week: number | null }) => i.day_of_week === templateDay)) {
			// biome-ignore lint/suspicious/noExplicitAny: untyped items
			const key = (item as any).meal_type_id ?? "__null__"
			if (!itemsByMealType[key]) itemsByMealType[key] = []
			itemsByMealType[key].push(item)
		}

		for (const [mealTypeId, items] of Object.entries(itemsByMealType)) {
			if (mealTypeId === "__null__") continue
			const menuId = crypto.randomUUID()
			newMenus.push({ id: menuId, service_date: dateStr, meal_type_id: mealTypeId, kitchen_id: input.kitchenId, status: "PLANNED" })
			for (const item of items) {
				// biome-ignore lint/suspicious/noExplicitAny: untyped items
				const typedItem = item as any
				newMenuItems.push({ daily_menu_id: menuId, recipe_origin_id: typedItem.recipe_id ?? "", recipe: typedItem.recipe_origin })
			}
		}
	}

	// Insert menus (with rollback)
	if (newMenus.length > 0) {
		const { error: menuInsertError } = await client.from("daily_menu").insert(newMenus)
		if (menuInsertError) {
			await rollback()
			throw new DomainError("INSERT_FAILED", menuInsertError.message)
		}
	}

	// Insert items (with double rollback — BUG FIX: restore previously deleted menus)
	if (newMenuItems.length > 0) {
		const { error: itemInsertError } = await client.from("menu_items").insert(newMenuItems)
		if (itemInsertError) {
			await client
				.from("daily_menu")
				.delete()
				.in(
					"id",
					newMenus.map((m) => m.id)
				)
			await rollback()
			throw new DomainError("INSERT_ITEMS_FAILED", itemInsertError.message)
		}
	}

	return { menusCreated: newMenus.length, itemsCreated: newMenuItems.length, datesProcessed: targetDates }
}
