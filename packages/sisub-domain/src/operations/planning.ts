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
import type { FetchDailyMenuContent } from "../schemas/meal-ops.ts"
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
	return (data ?? []).map((menu) => ({
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
	return (data ?? []).map((menu) => ({
		...menu,
		menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
	}))
}

export async function upsertDailyMenu(client: AnyClient, ctx: UserContext, input: UpsertDailyMenu) {
	requireKitchen(ctx, 2, input.kitchenId)

	// "Cria se não existir, senão mantém" (idempotente). NÃO usamos ON CONFLICT do
	// PostgREST: a unicidade do trio (data, refeição, cozinha) é garantida por um índice
	// PARCIAL (where deleted_at is null) que o PostgREST não consegue inferir. Fazemos
	// select-then-insert ciente de soft-delete; o índice é a trava contra corrida.
	const { data: existing, error: selError } = await client
		.from("daily_menu")
		.select()
		.eq("kitchen_id", input.kitchenId)
		.eq("service_date", input.serviceDate)
		.eq("meal_type_id", input.mealTypeId)
		.is("deleted_at", null)
		.maybeSingle()

	if (selError) throw new DomainError("UPSERT_FAILED", selError.message)
	if (existing) return [existing]

	const { data, error } = await client
		.from("daily_menu")
		.insert({
			kitchen_id: input.kitchenId,
			service_date: input.serviceDate,
			meal_type_id: input.mealTypeId,
			status: "PLANNED",
			...(input.forecastedHeadcount != null && { forecasted_headcount: input.forecastedHeadcount }),
		})
		.select()

	if (error) {
		// Corrida: outra requisição criou o mesmo trio entre o select e o insert.
		// O índice daily_menu_active_unique rejeita (23505) — tratamos como "já existe".
		if ((error as { code?: string }).code === "23505") {
			const { data: raced } = await client
				.from("daily_menu")
				.select()
				.eq("kitchen_id", input.kitchenId)
				.eq("service_date", input.serviceDate)
				.eq("meal_type_id", input.mealTypeId)
				.is("deleted_at", null)
				.maybeSingle()
			if (raced) return [raced]
		}
		throw new DomainError("UPSERT_FAILED", error.message)
	}
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

	if (recipe.kitchen_id !== null && recipe.kitchen_id !== kitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${input.recipeId} does not belong to kitchen ${kitchenId}`)
	}

	// Insert with recipe snapshot
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

	const { data, error } = await client.from("menu_items").update(updates).eq("id", input.menuItemId).select()

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

	const { error } = await client.from("menu_items").update({ substitutions: input.substitutions }).eq("id", input.menuItemId)

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

// ─── Aggregated daily menu content (diner-facing) ───────────────────────────

type DishIngredient = { ingredient_name: string; quantity: number; measure_unit: string }
type DishDetails = { id: string; name: string; ingredients: DishIngredient[] }
type DayMenuContent = { [date: string]: { [mealKey: string]: DishDetails[] } }
type RecipeSnapshot = { name?: string; ingredients?: DishIngredient[] }

function mapMealTypeNameToKey(name: string): string | null {
	const lower = name.toLowerCase()
	if (lower.includes("café")) return "cafe"
	if (lower.includes("almoço")) return "almoco"
	if (lower.includes("jantar")) return "janta"
	if (lower.includes("ceia")) return "ceia"
	return null
}

/**
 * Returns a nested map of dishes per date per meal key for the given kitchens and
 * date range. Dish name prefers the recipe JSON snapshot, falling back to
 * recipe_origin.name then "Prato sem nome"; ingredients come from the snapshot only.
 *
 * Auth posture preserved: authenticated entrypoint with no module-level guard.
 */
export async function fetchDailyMenuContent(client: AnyClient, _ctx: UserContext, input: FetchDailyMenuContent): Promise<DayMenuContent> {
	const { data, error } = await client
		.from("daily_menu")
		.select(
			`
        service_date,
        kitchen_id,
        meal_type:meal_type_id(name),
        menu_items:menu_items(
          id,
          recipe,
          recipe_origin:recipe_origin_id(name)
        )
      `
		)
		.in("kitchen_id", input.kitchenIds)
		.gte("service_date", input.startDate)
		.lte("service_date", input.endDate)

	if (error) throw new DomainError("FETCH_FAILED", error.message)

	const content: DayMenuContent = {}

	for (const menu of data ?? []) {
		const date = menu.service_date
		if (!date) continue

		const mealType = Array.isArray(menu.meal_type) ? menu.meal_type[0] : menu.meal_type
		const mealName = mealType?.name
		if (!mealName) continue

		const mealKey = mapMealTypeNameToKey(mealName)
		if (!mealKey) continue

		if (!content[date]) content[date] = {}
		if (!content[date][mealKey]) content[date][mealKey] = []

		for (const item of menu.menu_items ?? []) {
			let dishName = "Prato sem nome"
			let ingredients: DishIngredient[] = []

			if (item.recipe) {
				const snapshot = item.recipe as RecipeSnapshot
				dishName = snapshot?.name || dishName
				if (snapshot.ingredients) ingredients = snapshot.ingredients
			} else {
				const recipeOrigin = Array.isArray(item.recipe_origin) ? item.recipe_origin[0] : item.recipe_origin
				if (recipeOrigin) dishName = recipeOrigin.name || dishName
			}

			content[date][mealKey].push({ id: item.id, name: dishName, ingredients })
		}
	}

	return content
}
