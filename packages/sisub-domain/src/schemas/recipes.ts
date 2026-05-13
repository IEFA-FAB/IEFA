import { z } from "zod"
import { KitchenIdSchema, UuidSchema } from "./common.ts"

export const FetchRecipeSchema = z.object({
	recipeId: UuidSchema,
	includeAlternatives: z.boolean().optional(),
})
export type FetchRecipe = z.infer<typeof FetchRecipeSchema>

export const ListRecipesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
	search: z.string().max(200).optional(),
	globalOnly: z.boolean().optional(),
})
export type ListRecipes = z.infer<typeof ListRecipesSchema>

export const ListRecipeVersionsSchema = z.object({
	recipeId: UuidSchema,
})
export type ListRecipeVersions = z.infer<typeof ListRecipeVersionsSchema>

export const IngredientSchema = z.object({
	ingredientId: UuidSchema,
	netQuantity: z.number().positive(),
	isOptional: z.boolean(),
	priorityOrder: z.number().int().nonnegative(),
})
export type Ingredient = z.infer<typeof IngredientSchema>

export const CreateRecipeSchema = z.object({
	name: z.string().min(1),
	preparationMethod: z.string().optional(),
	portionYield: z.number().positive(),
	preparationTimeMinutes: z.number().int().positive().optional(),
	cookingFactor: z.number().positive().optional(),
	rationalId: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	ingredients: z.array(IngredientSchema).optional(),
})
export type CreateRecipe = z.infer<typeof CreateRecipeSchema>

export const CreateRecipeVersionSchema = CreateRecipeSchema.extend({
	baseRecipeId: UuidSchema,
	version: z.number().int().positive(),
})
export type CreateRecipeVersion = z.infer<typeof CreateRecipeVersionSchema>
