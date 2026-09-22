import type { ProductionTask as DBProductionTask, MealType, MenuItem, Recipe } from "@iefa/database/sisub"
import type { BoardSnackRequest } from "@iefa/sisub-domain"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

export type { ProductionTask as DBProductionTask } from "@iefa/database/sisub"

export type ProductionTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE"

/**
 * Linha da tabela `production_task` com status tipado.
 * Estende o tipo gerado pelo Supabase garantindo o union type de status.
 */
export type ProductionTask = Omit<DBProductionTask, "status"> & {
	status: ProductionTaskStatus
}

/** Pedido de lanche de onde veio o item do quadro (`fetchProductionBoard`). Nulo = item do rancho. */
export type ProductionSnackRequest = BoardSnackRequest

/**
 * Visão rica usada no Kanban de produção.
 * Junta menu_item + recipe_origin + meal_type + production_task numa estrutura única.
 */
export interface ProductionItem {
	task: ProductionTask
	menuItem: MenuItem & {
		recipe_origin: Recipe | null
		/** Ingredients completos para o sheet de detalhe */
		recipe_with_ingredients: RecipeWithIngredients | null
		/** Item de pedido de lanche: o quadro separa os kits por missão. Nulo = rancho. */
		snack_request: ProductionSnackRequest | null
	}
	mealType: MealType | null
}
