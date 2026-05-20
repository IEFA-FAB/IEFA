import type { Recipe, RecipeIngredient, RecipeIngredientAlternative } from "@iefa/database/sisub"
import type { Ingredient } from "./ingredients"

// Extended recipe with ingredients (Query Result)
export interface RecipeWithIngredients extends Recipe {
	ingredients: RecipeIngredientWithIngredient[]
}

// Recipe ingredient with ingredient details
export interface RecipeIngredientWithIngredient extends RecipeIngredient {
	ingredient: Ingredient | null
	alternatives?: RecipeIngredientAlternativeWithIngredient[]
}

// Alternative with ingredient details
export interface RecipeIngredientAlternativeWithIngredient extends RecipeIngredientAlternative {
	ingredient: Ingredient | null
}

export interface RecipeFormIngredient {
	ingredient_id: string
	net_quantity: number
	is_optional: boolean
	priority_order: number
}

// Form Data (Input)
export interface RecipeFormData {
	name: string
	preparation_method?: string | null
	portion_yield: number
	preparation_time_minutes?: number | null
	cooking_factor?: number | null
	rational_id?: string | null
	kitchen_id?: number | null
	base_recipe_id?: string | null
	ingredients?: RecipeFormIngredient[]
}

export interface RecipeIngredientFormData {
	id?: string
	ingredient_id: string
	net_quantity: number
	is_optional: boolean
	priority_order: number
}
