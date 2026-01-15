import type {
	Recipe,
	RecipeIngredient,
	RecipeIngredientAlternative,
} from "../supabase.types";
import type { Product } from "./products";

// Extended recipe with ingredients (Query Result)
export interface RecipeWithIngredients extends Recipe {
	ingredients: RecipeIngredientWithProduct[];
}

// Ingredient with product details
export interface RecipeIngredientWithProduct extends RecipeIngredient {
	product: Product | null;
	alternatives?: RecipeIngredientAlternativeWithProduct[];
}

// Alternative with product details
export interface RecipeIngredientAlternativeWithProduct
	extends RecipeIngredientAlternative {
	product: Product | null;
}

// Form Data (Input)
export interface RecipeFormData {
	name: string;
	preparation_method?: string | null;
	portion_yield: number;
	preparation_time_minutes?: number | null;
	cooking_factor?: number | null;
	rational_id?: string | null;
	kitchen_id?: number | null;
	base_recipe_id?: string | null;
	// Ingredients are handled as separate entities in form state usually,
	// but for submission payload they might be separate.
}

export interface RecipeIngredientFormData {
	id?: string;
	product_id: string;
	net_quantity: number;
	is_optional: boolean;
	priority_order: number;
}
