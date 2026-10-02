/**
 * Edição de preparação global por agente (chat dos módulos): os poucos campos que o modelo
 * altera, gravados como VERSÃO NOVA, pela mesma operation da tela.
 *
 * A tool `update_recipe` fazia `UPDATE` direto na linha que o modelo indicava: reescrevia uma
 * versão já publicada (o cardápio que a usou mudava de ficha por baixo), não conferia se ela
 * ainda era a vigente (uma versão superada voltava a mudar, e quem abrisse a vigente nunca via)
 * e não deixava rastro no histórico de versões. `EDIT-SAFETY.md`: escrita de registro
 * compartilhado confere a versão que a tela viu, no servidor, na mesma transação.
 *
 * Aqui a versão vista é o `recipeId` que o modelo leu (e que o cartão de aprovação descreveu).
 * `saveRecipeEdit` recusa com `RECIPE_VERSION_CONFLICT` se ela não for a vigente, sob o lock da
 * linhagem, e copia fluxo de produção e equipamentos para a versão nova.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { fetchRecipe, saveRecipeEdit } from "../operations/recipes.ts"
import { type SaveRecipeEdit, SaveRecipeEditSchema } from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

export interface AgentUpdateRecipe {
	/** Versão que o modelo leu. Tem de ser a vigente no catálogo global. */
	recipeId: string
	name?: string
	preparationTimeMinutes?: number
	cookingFactor?: number
}

export interface AgentUpdateRecipeResult {
	id: string
	name: string
	version: number
	preparation_time_minutes: number | null
	cooking_factor: number | null
	/** Versão de onde a nova saiu. */
	previous_version_id: string
}

type RecipeRow = Awaited<ReturnType<typeof fetchRecipe>>

const EDIT_ON_SCREEN = "Edite esta preparação pela tela de preparações."

/**
 * Ficha inteira da versão base, como a tela a reenvia ao salvar, com os campos do agente por
 * cima. Linha de ficha que a tela também não regravaria (preparação congelada, substituta sem
 * insumo) faz recusar em vez de sumir calada na versão nova.
 */
export function buildAgentRecipeEdit(base: RecipeRow, input: AgentUpdateRecipe): SaveRecipeEdit {
	const lines = base.ingredients.filter((line) => !line.deleted_at)
	if (lines.some((line) => !line.ingredient_id)) {
		throw new DomainError("AGENT_EDIT_UNSUPPORTED", `A ficha tem linha de preparação congelada, que o assistente não regrava. ${EDIT_ON_SCREEN}`)
	}
	if (lines.some((line) => (line.alternatives ?? []).some((alt) => !alt.ingredient_id))) {
		throw new DomainError("AGENT_EDIT_UNSUPPORTED", `A ficha tem substituta que não é insumo, que o assistente não regrava. ${EDIT_ON_SCREEN}`)
	}

	const candidate = {
		baseRecipeId: base.id,
		context: { scope: "global" as const },
		name: input.name ?? base.name,
		preparationMethod: base.preparation_method ?? undefined,
		prePreparationMethod: base.pre_preparation_method ?? undefined,
		portionYield: base.portion_yield,
		preparationTimeMinutes: input.preparationTimeMinutes ?? base.preparation_time_minutes ?? undefined,
		prePreparationTimeMinutes: base.pre_preparation_time_minutes ?? undefined,
		cookingTimeMinutes: base.cooking_time_minutes ?? undefined,
		cookingMethod: base.cooking_method ?? undefined,
		cookingTemperatureCelsius: base.cooking_temperature_celsius ?? undefined,
		cookingFactor: input.cookingFactor ?? base.cooking_factor ?? undefined,
		rationalId: base.rational_id ?? undefined,
		// Pasta omitida: `saveRecipeEdit` preserva a da versão base.
		ingredients: lines.map((line) => ({
			ingredientId: line.ingredient_id as string,
			netQuantity: line.net_quantity,
			isOptional: line.is_optional ?? false,
			priorityOrder: line.priority_order ?? 0,
			correctionFactor: line.correction_factor ?? null,
			rehydrationIndex: line.rehydration_index ?? null,
			// Mesma regra da tela: a posição vira a prioridade.
			alternatives: (line.alternatives ?? []).map((alt, index) => ({
				ingredientId: alt.ingredient_id as string,
				netQuantity: alt.net_quantity,
				priorityOrder: index,
			})),
		})),
	}

	const parsed = SaveRecipeEditSchema.safeParse(candidate)
	if (!parsed.success) {
		// Ficha antiga fora do que a tela aceita hoje (rendimento vazio, quantidade zerada…): a
		// versão nova não nasceria válida, e corrigir isso é com quem conhece a ficha.
		throw new DomainError("AGENT_EDIT_UNSUPPORTED", `A ficha atual tem campo que precisa de revisão antes de uma nova versão. ${EDIT_ON_SCREEN}`)
	}
	return parsed.data
}

export async function agentUpdateRecipe(db: SisubDb, ctx: UserContext, input: AgentUpdateRecipe): Promise<AgentUpdateRecipeResult> {
	const base = await fetchRecipe(db, ctx, { recipeId: input.recipeId })
	// O chat global só edita o catálogo da SDAB. Preparação de cozinha não é dele.
	if (base.kitchen_id != null) throw new DomainError("RECIPE_SCOPE_MISMATCH", "A preparação é de uma cozinha, não do catálogo global.")

	const { recipe } = await saveRecipeEdit(db, ctx, buildAgentRecipeEdit(base, input))
	return {
		id: recipe.id,
		name: recipe.name,
		version: recipe.version,
		preparation_time_minutes: recipe.preparation_time_minutes,
		cooking_factor: recipe.cooking_factor,
		previous_version_id: base.id,
	}
}
