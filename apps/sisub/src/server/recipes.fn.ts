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

export const fetchRecipesFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			kitchen_id: z.number().nullable().optional(),
			search: z.string().optional(),
			global_only: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient()
			.from("recipes")
			.select(recipeSelectWithIngredients)
			.is("deleted_at", null)
			.order("name")

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

export const fetchRecipeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("recipes")
			.select(recipeSelectWithAlternatives)
			.eq("id", data.id)
			.single()

		if (error) throw new Error(error.message)
		return result as RecipeWithIngredients
	})

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
			const { error: ingredientsError } = await getSupabaseServerClient().from("recipe_ingredients").insert(
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
			const { error: ingredientsError } = await getSupabaseServerClient().from("recipe_ingredients").insert(
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
