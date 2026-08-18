import type { FrozenPreparation, Recipe, RecipeIngredient } from "@iefa/database/sisub"
import type { Ingredient } from "./ingredients"

// Extended recipe with ingredients (Query Result)
export interface RecipeWithIngredients extends Recipe {
	ingredients: RecipeIngredientWithIngredient[]
}

// Recipe ingredient with ingredient details
export interface RecipeIngredientWithIngredient extends RecipeIngredient {
	ingredient: Ingredient | null
	/**
	 * Origem alternativa da linha: preparação congelada em vez de insumo cru (o CHECK
	 * `recipe_ingredients_source_xor` garante que só uma das duas está preenchida). O
	 * servidor sempre mandou este campo (`RecipeIngredientWire` no domínio) — faltava
	 * declará-lo aqui, e a ficha impressa não tinha como nomear a linha.
	 */
	frozen_preparation?: FrozenPreparation | null
}

export interface RecipeFormIngredient {
	ingredient_id: string
	net_quantity: number
	is_optional: boolean
	priority_order: number
	correction_factor?: number | null
	rehydration_index?: number | null
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
	/** Pasta de organização (agrupamento simples). `null` = sem pasta. */
	folder_id?: string | null
	ingredients?: RecipeFormIngredient[]
}

export interface RecipeIngredientFormData {
	id?: string
	ingredient_id: string
	net_quantity: number
	is_optional: boolean
	priority_order: number
}
