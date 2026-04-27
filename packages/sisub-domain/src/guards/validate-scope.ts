import type { SupabaseClient } from "@supabase/supabase-js"
import { DomainError, NotFoundError } from "../types/errors.ts"

type TemplateRow = {
	id: string
	kitchen_id: number | null
	name: string | null
	deleted_at: string | null
}

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function validateRecipeAccess(client: AnyClient, recipeId: string, targetKitchenId: number): Promise<void> {
	const { data, error } = await client.from("recipes").select("kitchen_id").eq("id", recipeId).single()
	if (error || !data) throw new NotFoundError("recipe", recipeId)
	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	const row = data as any
	if (row.kitchen_id !== null && row.kitchen_id !== targetKitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${recipeId} does not belong to kitchen ${targetKitchenId}`)
	}
}

export async function validateTemplateAccess(client: AnyClient, templateId: string, kitchenId: number | null): Promise<TemplateRow> {
	const { data, error } = await client.from("menu_template").select("id, kitchen_id, name, deleted_at").eq("id", templateId).single()
	if (error || !data) throw new NotFoundError("menu_template", templateId)
	const template = data as unknown as TemplateRow
	if (template.deleted_at !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${templateId} is deleted`)
	if (template.kitchen_id !== null && kitchenId !== null && template.kitchen_id !== kitchenId) {
		throw new DomainError("TEMPLATE_ACCESS_DENIED", `Template ${templateId} does not belong to kitchen ${kitchenId}`)
	}
	return template
}

export async function resolveKitchenFromMenu(client: AnyClient, dailyMenuId: string): Promise<number> {
	const { data, error } = await client.from("daily_menu").select("kitchen_id").eq("id", dailyMenuId).single()
	if (error || !data) throw new NotFoundError("daily_menu", dailyMenuId)
	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	const kitchenId = (data as any).kitchen_id
	if (kitchenId == null) throw new NotFoundError("daily_menu", dailyMenuId)
	return kitchenId as number
}

export async function resolveKitchenFromMenuItem(client: AnyClient, menuItemId: string): Promise<number> {
	const { data, error } = await client.from("menu_items").select("daily_menu:daily_menu_id(kitchen_id)").eq("id", menuItemId).single()
	if (error || !data) throw new NotFoundError("menu_item", menuItemId)
	// biome-ignore lint/suspicious/noExplicitAny: nested relation shape
	const kitchenId = (data as any).daily_menu?.kitchen_id
	if (kitchenId == null) throw new NotFoundError("menu_item", menuItemId)
	return kitchenId as number
}

export async function resolveKitchenFromTemplate(client: AnyClient, templateId: string): Promise<number | null> {
	const { data, error } = await client.from("menu_template").select("kitchen_id").eq("id", templateId).single()
	if (error || !data) throw new NotFoundError("menu_template", templateId)
	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	return (data as any).kitchen_id as number | null
}
