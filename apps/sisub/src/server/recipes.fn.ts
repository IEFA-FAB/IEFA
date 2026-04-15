/**
 * @module recipes.fn
 * Recipe CRUD with versioning system (base_recipe_id self-reference git-like branching).
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: recipes, recipe_ingredients, recipe_ingredient_alternatives.
 * Versioning: base_recipe_id=null → root recipe (version 1); non-null → version branching from that root.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { RecipeFormData, RecipeWithIngredients } from "@/types/domain/recipes"

const recipeSelectWithIngredients = `
  *,
  ingredients:recipe_ingredients(
    *,
    product:product_id(*)
  )
` as const

const recipeSelectWithAlternatives = `
  *,
  ingredients:recipe_ingredients(
    *,
    product:product(*),
    alternatives:recipe_ingredient_alternatives(
      *,
      product:product(*)
    )
  )
` as const

/**
 * Lists active recipes with ingredients and products, optionally filtered by kitchen, global-only flag or name search.
 *
 * @remarks
 * Filters are cumulative: kitchen_id → exact match; global_only → kitchen_id IS NULL; search → ilike on name.
 * No filter means all non-deleted recipes across all kitchens.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchRecipesFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			kitchen_id: z.number().nullable().optional(),
			search: z.string().optional(),
			global_only: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("recipes").select(recipeSelectWithIngredients).is("deleted_at", null).order("name")

		if (data.kitchen_id !== undefined && data.kitchen_id !== null) {
			query = query.eq("kitchen_id", data.kitchen_id)
		}

		if (data.global_only) {
			query = query.is("kitchen_id", null)
		}

		if (data.search) {
			query = query.ilike("name", `%${data.search}%`)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result as RecipeWithIngredients[]
	})

/**
 * Fetches a single recipe with ingredients, products and ingredient alternatives (full detail view including alternatives).
 *
 * @throws {Error} on Supabase query failure or not found (via .single()).
 */
export const fetchRecipeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("recipes").select(recipeSelectWithAlternatives).eq("id", data.id).single()

		if (error) throw new Error(error.message)
		return result as RecipeWithIngredients
	})

/**
 * Fetches a single non-deleted recipe with ingredients and products (without alternatives). Throws explicitly if not found.
 *
 * @throws {Error} "Recipe {id} not found" if row is missing; Supabase error message otherwise.
 */
export const fetchRecipeWithIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("recipes")
			.select(recipeSelectWithIngredients)
			.eq("id", data.id)
			.is("deleted_at", null)
			.single()

		if (error) throw new Error(error.message)
		if (!result) throw new Error(`Recipe ${data.id} not found`)
		return result as RecipeWithIngredients
	})

const ingredientSchema = z.object({
	product_id: z.string(),
	net_quantity: z.number(),
	is_optional: z.boolean(),
	priority_order: z.number(),
})

const recipePayloadSchema = z.object({
	name: z.string(),
	preparation_method: z.string().nullable().optional(),
	portion_yield: z.number(),
	preparation_time_minutes: z.number().nullable().optional(),
	cooking_factor: z.number().nullable().optional(),
	rational_id: z.string().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	ingredients: z.array(ingredientSchema).optional(),
})

/**
 * Creates a new recipe with version=1 and optionally inserts its ingredients.
 *
 * @remarks
 * SIDE EFFECTS: inserts into recipes then recipe_ingredients. No rollback on ingredients failure — orphan recipe row possible.
 *
 * @throws {Error} on recipe or ingredient insert failure.
 */
export const createRecipeFn = createServerFn({ method: "POST" })
	.inputValidator(recipePayloadSchema)
	.handler(async ({ data }) => {
		const { data: recipe, error: recipeError } = await getSupabaseServerClient()
			.from("recipes")
			.insert({
				name: data.name,
				preparation_method: data.preparation_method,
				portion_yield: data.portion_yield,
				preparation_time_minutes: data.preparation_time_minutes,
				cooking_factor: data.cooking_factor,
				rational_id: data.rational_id,
				kitchen_id: data.kitchen_id,
				version: 1,
			} as RecipeFormData & { version: number })
			.select()
			.single()

		if (recipeError) throw new Error(recipeError.message)

		const ingredients = data.ingredients ?? []
		if (ingredients.length > 0) {
			const { error: ingredientsError } = await getSupabaseServerClient()
				.from("recipe_ingredients")
				.insert(
					ingredients.map((ing) => ({
						recipe_id: recipe.id,
						product_id: ing.product_id,
						net_quantity: ing.net_quantity,
						is_optional: ing.is_optional,
						priority_order: ing.priority_order,
					}))
				)

			if (ingredientsError) throw new Error(ingredientsError.message)
		}

		return recipe
	})

/**
 * Returns all versions of a recipe family (root + all branches) ordered by version ascending.
 *
 * @remarks
 * Root resolution: if recipeId has base_recipe_id, uses that as rootId; otherwise recipeId itself is root.
 * Query: OR(id=rootId, base_recipe_id=rootId).
 *
 * @throws {Error} "Receita não encontrada" if the initial recipe lookup fails.
 */
export const fetchRecipeVersionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ recipeId: z.string() }))
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		// Busca a receita para encontrar o id raiz (original)
		const { data: recipe, error: recipeError } = await supabase.from("recipes").select("id, base_recipe_id").eq("id", data.recipeId).single()

		if (recipeError || !recipe) throw new Error("Receita não encontrada")

		// Se tem base_recipe_id, usa como raiz; caso contrário, a própria receita é a raiz
		const rootId = recipe.base_recipe_id ?? recipe.id

		// Busca todas as versões: a raiz + todas que referenciam esta raiz
		const { data: versions, error } = await supabase
			.from("recipes")
			.select(recipeSelectWithIngredients)
			.or(`id.eq.${rootId},base_recipe_id.eq.${rootId}`)
			.order("version", { ascending: true })

		if (error) throw new Error(error.message)
		return (versions ?? []) as RecipeWithIngredients[]
	})

/**
 * Creates a new recipe version linked to base_recipe_id with a new version number, optionally inserting its ingredients.
 *
 * @remarks
 * SIDE EFFECTS: inserts into recipes (with base_recipe_id + new_version) then recipe_ingredients. No rollback on ingredients failure.
 *
 * @throws {Error} on recipe or ingredient insert failure.
 */
export const createRecipeVersionFn = createServerFn({ method: "POST" })
	.inputValidator(
		recipePayloadSchema.extend({
			base_recipe_id: z.string(),
			new_version: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { data: recipe, error: recipeError } = await getSupabaseServerClient()
			.from("recipes")
			.insert({
				name: data.name,
				preparation_method: data.preparation_method,
				portion_yield: data.portion_yield,
				preparation_time_minutes: data.preparation_time_minutes,
				cooking_factor: data.cooking_factor,
				rational_id: data.rational_id,
				kitchen_id: data.kitchen_id,
				base_recipe_id: data.base_recipe_id,
				version: data.new_version,
			} as RecipeFormData & { base_recipe_id: string; version: number })
			.select()
			.single()

		if (recipeError) throw new Error(recipeError.message)

		const ingredients = data.ingredients ?? []
		if (ingredients.length > 0) {
			const { error: ingredientsError } = await getSupabaseServerClient()
				.from("recipe_ingredients")
				.insert(
					ingredients.map((ing) => ({
						recipe_id: recipe.id,
						product_id: ing.product_id,
						net_quantity: ing.net_quantity,
						is_optional: ing.is_optional,
						priority_order: ing.priority_order,
					}))
				)

			if (ingredientsError) throw new Error(ingredientsError.message)
		}

		return recipe
	})
