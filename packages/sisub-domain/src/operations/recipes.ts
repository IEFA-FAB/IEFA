/**
 * Recipe operations — canonical implementation.
 *
 * Bug fix vs sisub:
 *   - fetchRecipe: filters deleted_at IS NULL (was missing in sisub — returned trashed recipes)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateRecipe, CreateRecipeVersion, FetchRecipe, ListRecipes, ListRecipeVersions } from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

const RECIPE_WITH_INGREDIENTS = `
  *,
  ingredients:recipe_ingredients(*, ingredient:ingredient_id(*))
` as const

const RECIPE_WITH_ALTERNATIVES = `
  *,
  ingredients:recipe_ingredients(
    *,
    ingredient:ingredient_id(*),
    alternatives:recipe_ingredient_alternatives(*, ingredient:ingredient_id(*))
  )
` as const

export async function fetchRecipe(client: AnyClient, ctx: UserContext, input: FetchRecipe) {
	requirePermission(ctx, "kitchen", 1)

	const select = input.includeAlternatives ? RECIPE_WITH_ALTERNATIVES : RECIPE_WITH_INGREDIENTS

	// BUG FIX: filter deleted_at IS NULL — sisub was missing this
	const { data, error } = await client.from("recipes").select(select).eq("id", input.recipeId).is("deleted_at", null).single()

	if (error || !data) throw new NotFoundError("recipe", input.recipeId)
	return data
}

export async function listRecipes(client: AnyClient, ctx: UserContext, input: ListRecipes) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	let query = client.from("recipes").select(RECIPE_WITH_INGREDIENTS).is("deleted_at", null).order("name")

	if (input.kitchenId != null && !input.globalOnly) {
		query = query.or(`kitchen_id.is.null,kitchen_id.eq.${input.kitchenId}`)
	} else {
		query = query.is("kitchen_id", null)
	}

	if (input.search) {
		query = query.ilike("name", `%${input.search}%`)
	}

	const { data, error } = await query
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function listRecipeVersions(client: AnyClient, ctx: UserContext, input: ListRecipeVersions) {
	requirePermission(ctx, "kitchen", 1)

	const { data: recipe, error: recipeError } = await client.from("recipes").select("id, base_recipe_id").eq("id", input.recipeId).single()
	if (recipeError || !recipe) throw new NotFoundError("recipe", input.recipeId)

	// biome-ignore lint/suspicious/noExplicitAny: untyped row
	const rootId = (recipe as any).base_recipe_id ?? recipe.id

	const { data, error } = await client
		.from("recipes")
		.select(RECIPE_WITH_INGREDIENTS)
		.or(`id.eq.${rootId},base_recipe_id.eq.${rootId}`)
		.order("version", { ascending: true })

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

async function insertIngredients(client: AnyClient, recipeId: string, ingredients: CreateRecipe["ingredients"]) {
	if (!ingredients?.length) return
	const rows = ingredients.map((ing) => ({
		recipe_id: recipeId,
		ingredient_id: ing.ingredientId,
		net_quantity: ing.netQuantity,
		is_optional: ing.isOptional,
		priority_order: ing.priorityOrder,
	}))
	const { error } = await client.from("recipe_ingredients").insert(rows)
	if (error) throw new DomainError("INSERT_INGREDIENTS_FAILED", error.message)
}

export async function createRecipe(client: AnyClient, ctx: UserContext, input: CreateRecipe) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { data: recipe, error } = await client
		.from("recipes")
		.insert({
			name: input.name,
			preparation_method: input.preparationMethod ?? null,
			portion_yield: input.portionYield,
			preparation_time_minutes: input.preparationTimeMinutes ?? null,
			cooking_factor: input.cookingFactor ?? null,
			rational_id: input.rationalId ?? null,
			kitchen_id: input.kitchenId ?? null,
			version: 1,
		})
		.select()
		.single()

	if (error) throw new DomainError("INSERT_FAILED", error.message)
	await insertIngredients(client, recipe.id, input.ingredients)
	return recipe
}

export async function createRecipeVersion(client: AnyClient, ctx: UserContext, input: CreateRecipeVersion) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { data: recipe, error } = await client
		.from("recipes")
		.insert({
			name: input.name,
			preparation_method: input.preparationMethod ?? null,
			portion_yield: input.portionYield,
			preparation_time_minutes: input.preparationTimeMinutes ?? null,
			cooking_factor: input.cookingFactor ?? null,
			rational_id: input.rationalId ?? null,
			kitchen_id: input.kitchenId ?? null,
			base_recipe_id: input.baseRecipeId,
			version: input.version,
		})
		.select()
		.single()

	if (error) throw new DomainError("INSERT_FAILED", error.message)
	await insertIngredients(client, recipe.id, input.ingredients)
	return recipe
}
