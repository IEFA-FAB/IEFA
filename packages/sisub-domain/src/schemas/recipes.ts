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
	/** Quando true, inclui receitas com soft delete (deleted_at) na listagem. */
	includeDeleted: z.boolean().optional(),
})
export type ListRecipes = z.infer<typeof ListRecipesSchema>

export const ListRecipeVersionsSchema = z.object({
	recipeId: UuidSchema,
})
export type ListRecipeVersions = z.infer<typeof ListRecipeVersionsSchema>

export const DeleteRecipeSchema = z.object({ id: UuidSchema })
export type DeleteRecipe = z.infer<typeof DeleteRecipeSchema>

export const RestoreRecipeSchema = z.object({ id: UuidSchema })
export type RestoreRecipe = z.infer<typeof RestoreRecipeSchema>

/** Renomeia uma receita in-place (usado por localizar e substituir em massa). */
export const RenameRecipeSchema = z.object({ id: UuidSchema, name: z.string().min(1).max(200) })
export type RenameRecipe = z.infer<typeof RenameRecipeSchema>

export const IngredientAlternativeSchema = z.object({
	ingredientId: UuidSchema,
	netQuantity: z.number().positive(),
	priorityOrder: z.number().int().nonnegative(),
})
export type IngredientAlternative = z.infer<typeof IngredientAlternativeSchema>

export const IngredientSchema = z.object({
	ingredientId: UuidSchema,
	netQuantity: z.number().positive(),
	isOptional: z.boolean(),
	priorityOrder: z.number().int().nonnegative(),
	/** Insumos que podem substituir este na preparação (recipe_ingredient_alternatives). */
	alternatives: z.array(IngredientAlternativeSchema).optional(),
})
export type Ingredient = z.infer<typeof IngredientSchema>

export const CreateRecipeSchema = z.object({
	name: z.string().min(1),
	preparationMethod: z.string().optional(),
	portionYield: z.number().positive(),
	preparationTimeMinutes: z.number().int().nonnegative().optional(),
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
