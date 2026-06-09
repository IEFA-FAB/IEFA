/**
 * Recipe operations — canonical implementation.
 *
 * Bug fix vs sisub:
 *   - fetchRecipe: filters deleted_at IS NULL (was missing in sisub — returned trashed recipes)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateRecipe,
	CreateRecipeVersion,
	DeleteRecipe,
	FetchRecipe,
	ListRecipes,
	ListRecipeVersions,
	RenameRecipe,
	RestoreRecipe,
} from "../schemas/recipes.ts"
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

	let query = client.from("recipes").select(RECIPE_WITH_INGREDIENTS).order("name")

	if (!input.includeDeleted) {
		query = query.is("deleted_at", null)
	}

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

	// Deduplicate: keep only the latest version of each recipe family.
	// Versioning inserts new rows (base_recipe_id → root). Group by root ID,
	// return the entry with the highest version number.
	const familyMap = new Map<string, (typeof data)[0]>()
	for (const recipe of data ?? []) {
		const rootId = recipe.base_recipe_id ?? recipe.id
		const existing = familyMap.get(rootId)
		if (!existing || recipe.version > existing.version) {
			familyMap.set(rootId, recipe)
		}
	}

	return Array.from(familyMap.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export async function listRecipeVersions(client: AnyClient, ctx: UserContext, input: ListRecipeVersions) {
	requirePermission(ctx, "kitchen", 1)

	const { data: recipe, error: recipeError } = await client.from("recipes").select("id, base_recipe_id").eq("id", input.recipeId).single()
	if (recipeError || !recipe) throw new NotFoundError("recipe", input.recipeId)

	const rootId = recipe.base_recipe_id ?? recipe.id

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
	// .select() devolve as linhas na ordem de inserção (INSERT ... RETURNING multi-row),
	// permitindo ligar cada alternativa ao recipe_ingredient recém-criado.
	const { data: inserted, error } = await client.from("recipe_ingredients").insert(rows).select("id")
	if (error || !inserted) throw new DomainError("INSERT_INGREDIENTS_FAILED", error?.message ?? "no rows returned")

	const altRows = inserted.flatMap((row: { id: string }, i: number) =>
		(ingredients[i].alternatives ?? []).map((alt) => ({
			recipe_ingredient_id: row.id,
			ingredient_id: alt.ingredientId,
			net_quantity: alt.netQuantity,
			priority_order: alt.priorityOrder,
		}))
	)
	if (altRows.length) {
		const { error: altError } = await client.from("recipe_ingredient_alternatives").insert(altRows)
		if (altError) throw new DomainError("INSERT_ALTERNATIVES_FAILED", altError.message)
	}
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

/**
 * Autoriza mutação destrutiva sobre UMA receita conforme a posse:
 * receita local → exige nível 2 NAQUELA cozinha; receita global → exige "global" nível 2.
 * Evita IDOR: sem isso, qualquer usuário kitchen-2 apagaria receitas de outras cozinhas/globais.
 */
async function authorizeRecipeMutation(client: AnyClient, ctx: UserContext, recipeId: string): Promise<void> {
	const { data: recipe, error } = await client.from("recipes").select("kitchen_id").eq("id", recipeId).single()
	if (error || !recipe) throw new NotFoundError("recipe", recipeId)

	if (recipe.kitchen_id == null) {
		requirePermission(ctx, "global", 2)
	} else {
		requireKitchen(ctx, 2, recipe.kitchen_id)
	}
}

/** Soft delete: marca deleted_at. A receita some das listagens (exceto includeDeleted). */
export async function deleteRecipe(client: AnyClient, ctx: UserContext, input: DeleteRecipe) {
	await authorizeRecipeMutation(client, ctx, input.id)
	const { error } = await client.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", input.id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

/** Restaura uma receita previamente excluída (deleted_at = null). */
export async function restoreRecipe(client: AnyClient, ctx: UserContext, input: RestoreRecipe) {
	await authorizeRecipeMutation(client, ctx, input.id)
	const { error } = await client.from("recipes").update({ deleted_at: null }).eq("id", input.id)
	if (error) throw new DomainError("RESTORE_FAILED", error.message)
}

/** Renomeia uma receita in-place (não cria versão). Usado por localizar e substituir. */
export async function renameRecipe(client: AnyClient, ctx: UserContext, input: RenameRecipe) {
	await authorizeRecipeMutation(client, ctx, input.id)
	const { error } = await client.from("recipes").update({ name: input.name }).eq("id", input.id)
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
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
