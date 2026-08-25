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
	/**
	 * Substitutos desta linha (`kitchen.recipe_ingredient_alternatives`). Opcional porque
	 * só `fetchRecipe` os carrega: a listagem devolve ~2.000 fichas e ninguém lista
	 * substituto de todas.
	 */
	alternatives?: RecipeIngredientAlternativeWithIngredient[]
}

/**
 * Substituto de UMA linha da ficha, já com o insumo resolvido. `net_quantity` é a
 * gramatura da substituta NESTA preparação, não um fator — é justamente o que o par
 * global aposentado (`ingredient_substitution`) não conseguia expressar.
 */
export interface RecipeIngredientAlternativeWithIngredient {
	id: string
	ingredient_id: string | null
	frozen_preparation_id: string | null
	net_quantity: number | null
	priority_order: number | null
	ingredient: Ingredient | null
	frozen_preparation?: FrozenPreparation | null
}

/**
 * Substituto de uma linha da ficha COMO O FORMULÁRIO o mantém: com nome e unidade para a
 * tela, e a quantidade em edição. Mora aqui porque a tabela de ingredientes e o painel de
 * substituições compartilham a mesma linha — cada `patch` de uma delas devolve o objeto
 * inteiro, e um tipo por componente deixaria uma apagando os substitutos da outra.
 */
export interface RecipeAlternativeFormRow {
	ingredient_id: string
	ingredient_name: string
	measure_unit: string
	/** Peso líquido TOTAL da substituta na preparação — não um fator. */
	net_quantity: number | null
}

export interface RecipeFormIngredient {
	ingredient_id: string
	net_quantity: number
	is_optional: boolean
	priority_order: number
	correction_factor?: number | null
	rehydration_index?: number | null
	/**
	 * Substitutos da linha, no formato do payload de escrita. Precisa estar declarado
	 * aqui: `mapIngredients` monta o corpo do server fn a partir DESTE tipo, e um campo
	 * ausente dele é silenciosamente descartado — o TypeScript não reclama porque o
	 * objeto vem de uma variável, não de um literal, então não há checagem de
	 * propriedade excedente.
	 */
	alternatives?: { ingredient_id: string; net_quantity: number; priority_order: number }[]
}

// Form Data (Input)
export interface RecipeFormData {
	name: string
	preparation_method?: string | null
	/** Pré-preparo — o que antecede a cocção (PARTE 03 do modelo FTP/SIA). */
	pre_preparation_method?: string | null
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
