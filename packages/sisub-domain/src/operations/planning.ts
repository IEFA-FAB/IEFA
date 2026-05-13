/**
 * Planning operations — canonical implementation.
 *
 * Bug fixes vs sisub divergence:
 *   - addMenuItem validates recipe kitchen_id (was missing in sisub)
 *   - fetchDailyMenus filters menu_items in DB query (not in memory)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requireKitchen } from "../guards/require-permission.ts"
import { resolveKitchenFromMenu, resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import type {
	AddMenuItem,
	DailyMenuFetch,
	DayDetailsFetch,
	GetTrashItems,
	RemoveMenuItem,
	RestoreMenuItem,
	UpdateHeadcount,
	UpdateMenuItem,
	UpdateSubstitutions,
	UpsertDailyMenu,
} from "../schemas/planning.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

const DAILY_MENU_WITH_ITEMS = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(*, recipe_origin:recipe_origin_id(*))
` as const

export async function fetchDailyMenus(client: AnyClient, ctx: UserContext, input: DailyMenuFetch) {
	requireKitchen(ctx, 1, input.kitchenId)

	const { data, error } = await client
		.from("daily_menu")
		.select(DAILY_MENU_WITH_ITEMS)
		.eq("kitchen_id", input.kitchenId)
		.gte("service_date", input.startDate)
		.lte("service_date", input.endDate)
		.is("deleted_at", null)
		.order("service_date")
		.order("meal_type_id")

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	// biome-ignore lint/suspicious/noExplicitAny: untyped rows
	return (data ?? []).map((menu: any) => ({
		...menu,
		menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
	}))
}

export async function fetchDayDetails(client: AnyClient, ctx: UserContext, input: DayDetailsFetch) {
	requireKitchen(ctx, 1, input.kitchenId)

	const { data, error } = await client
		.from("daily_menu")
		.select(DAILY_MENU_WITH_ITEMS)
		.eq("kitchen_id", input.kitchenId)
		.eq("service_date", input.date)
		.is("deleted_at", null)

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	// biome-ignore lint/suspicious/noExplicitAny: untyped rows
	return (data ?? []).map((menu: any) => ({
		...menu,
		menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
	}))
}

export async function upsertDailyMenu(client: AnyClient, ctx: UserContext, input: UpsertDailyMenu) {
	requireKitchen(ctx, 2, input.kitchenId)

	const { data, error } = await client
		.from("daily_menu")
		.upsert(
			{
				kitchen_id: input.kitchenId,
				service_date: input.serviceDate,
				meal_type_id: input.mealTypeId,
				status: "PLANNED",
				...(input.forecastedHeadcount != null && { forecasted_headcount: input.forecastedHeadcount }),
			},
			{ onConflict: "service_date,meal_type_id,kitchen_id", ignoreDuplicates: true }
		)
		.select()

	if (error) throw new DomainError("UPSERT_FAILED", error.message)
	return data
}

export async function addMenuItem(client: AnyClient, ctx: UserContext, input: AddMenuItem) {
	const kitchenId = await resolveKitchenFromMenu(client, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	// Fetch full recipe (includes kitchen_id) — replaces separate validateRecipeAccess call
	const { data: recipe, error: recipeError } = await client
		.from("recipes")
		.select("*, ingredients:recipe_ingredients(*, ingredient:ingredient_id(*))")
		.eq("id", input.recipeId)
		.is("deleted_at", null)
		.single()

	if (recipeError || !recipe) throw new DomainError("RECIPE_NOT_FOUND", `Recipe ${input.recipeId} not found`)

	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	if ((recipe as any).kitchen_id !== null && (recipe as any).kitchen_id !== kitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${input.recipeId} does not belong to kitchen ${kitchenId}`)
	}

	// 4. Insert with recipe snapshot
	const { data, error } = await client
		.from("menu_items")
		.insert({
			daily_menu_id: input.dailyMenuId,
			recipe_origin_id: input.recipeId,
			recipe: recipe,
			...(input.plannedPortionQuantity != null && { planned_portion_quantity: input.plannedPortionQuantity }),
			...(input.excludedFromProcurement != null && { excluded_from_procurement: input.excludedFromProcurement }),
		})
		.select()

	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function updateMenuItem(client: AnyClient, ctx: UserContext, input: UpdateMenuItem) {
	const kitchenId = await resolveKitchenFromMenuItem(client, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const updates: Record<string, unknown> = {}
	if (input.plannedPortionQuantity != null) updates.planned_portion_quantity = input.plannedPortionQuantity
	if (input.excludedFromProcurement != null) updates.excluded_from_procurement = input.excludedFromProcurement

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const { data, error } = await client
		.from("menu_items")
		// biome-ignore lint/suspicious/noExplicitAny: dynamic update object
		.update(updates as any)
		.eq("id", input.menuItemId)
		.select()

	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function removeMenuItem(client: AnyClient, ctx: UserContext, input: RemoveMenuItem) {
	const kitchenId = await resolveKitchenFromMenuItem(client, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const { error } = await client.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", input.menuItemId)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function restoreMenuItem(client: AnyClient, ctx: UserContext, input: RestoreMenuItem) {
	const kitchenId = await resolveKitchenFromMenuItem(client, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const { error } = await client.from("menu_items").update({ deleted_at: null }).eq("id", input.menuItemId)
	if (error) throw new DomainError("RESTORE_FAILED", error.message)
}

export async function updateHeadcount(client: AnyClient, ctx: UserContext, input: UpdateHeadcount) {
	const kitchenId = await resolveKitchenFromMenu(client, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	const { data, error } = await client.from("daily_menu").update({ forecasted_headcount: input.forecastedHeadcount }).eq("id", input.dailyMenuId).select()

	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function updateSubstitutions(client: AnyClient, ctx: UserContext, input: UpdateSubstitutions) {
	const kitchenId = await resolveKitchenFromMenuItem(client, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const { error } = await client
		.from("menu_items")
		// biome-ignore lint/suspicious/noExplicitAny: Json column
		.update({ substitutions: input.substitutions as any })
		.eq("id", input.menuItemId)

	if (error) throw new DomainError("UPDATE_FAILED", error.message)
}

export async function getTrashItems(client: AnyClient, ctx: UserContext, input: GetTrashItems) {
	requireKitchen(ctx, 1, input.kitchenId)

	const { data, error } = await client
		.from("menu_items")
		.select("*, recipe_origin:recipe_origin_id(*), daily_menu!inner(*)")
		.not("deleted_at", "is", null)
		.eq("daily_menu.kitchen_id", input.kitchenId)
		.order("deleted_at", { ascending: false })

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}
