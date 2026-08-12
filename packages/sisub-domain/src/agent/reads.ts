/**
 * Leituras de catálogo prontas para agentes — a mesma resposta para o chat dos módulos e
 * para o servidor MCP.
 *
 * O que estas funções acrescentam às operations: teto de itens, projeção enxuta e um
 * envelope com as contagens. O envelope importa — sem `total`, o modelo lê 30 receitas e
 * conclui que o catálogo tem 30; com ele, sabe que precisa refinar a busca.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { listIngredients } from "../operations/ingredients.ts"
import { listRecipeSummaries, type RecipeSummary } from "../operations/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { clampLimit } from "./budget.ts"
import type { AgentListIngredients, AgentListPreparations, AgentListRecipes } from "./schemas.ts"

/** Envelope comum: a página pedida mais o que o modelo precisa saber sobre o resto. */
export interface AgentList<T> {
	items: T[]
	returned: number
	total: number
	limit: number
}

function paginate<T>(rows: T[], limit: number): AgentList<T> {
	return { items: rows.slice(0, limit), returned: Math.min(rows.length, limit), total: rows.length, limit }
}

export async function agentListRecipes(db: SisubDb, ctx: UserContext, input: AgentListRecipes & { globalOnly?: boolean }): Promise<AgentList<RecipeSummary>> {
	const limit = clampLimit(input.limit)
	const rows = await listRecipeSummaries(db, ctx, { kitchenId: input.kitchenId, search: input.search, globalOnly: input.globalOnly })
	return paginate(rows, limit)
}

/** Insumo/preparação na listagem: identificação e unidade — nutrientes e SKUs saem por `fetchIngredient`. */
export interface AgentIngredientSummary {
	id: string
	description: string | null
	measure_unit: string | null
	folder_id: string | null
}

function slimIngredient(row: { id: string; description: string | null; measure_unit: string | null; folder_id: string | null }): AgentIngredientSummary {
	return { id: row.id, description: row.description, measure_unit: row.measure_unit, folder_id: row.folder_id }
}

export async function agentListIngredients(db: SisubDb, ctx: UserContext, input: AgentListIngredients): Promise<AgentList<AgentIngredientSummary>> {
	const limit = clampLimit(input.limit)
	const rows = await listIngredients(db, ctx, { search: input.search, folderId: input.folderId })
	return paginate(rows.map(slimIngredient), limit)
}

/**
 * As preparações herdadas do SISUBWEB moram na tabela de insumos mas não são insumos —
 * `preparations: "only"` é o escopo que o catálogo já usa para separá-las.
 */
export async function agentListPreparations(db: SisubDb, ctx: UserContext, input: AgentListPreparations): Promise<AgentList<AgentIngredientSummary>> {
	const limit = clampLimit(input.limit)
	const rows = await listIngredients(db, ctx, { search: input.search, preparations: "only" })
	return paginate(rows.map(slimIngredient), limit)
}
