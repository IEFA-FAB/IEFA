/**
 * Leituras de catálogo prontas para agentes — a mesma resposta para o chat dos módulos e
 * para o servidor MCP.
 *
 * O que estas funções acrescentam às operations: teto de itens, projeção enxuta e um
 * envelope com as contagens. O envelope importa — sem `total`, o modelo lê 30 receitas e
 * conclui que o catálogo tem 30; com ele, sabe que precisa refinar a busca.
 */

import { folderInKitchen, recipeFolderInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { inArray } from "drizzle-orm"
import { listIngredients } from "../operations/ingredients.ts"
import { fetchRecipe, listRecipeSummaries, type RecipeSummary } from "../operations/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { runQuery } from "../utils/index.ts"
import { clampLimit } from "./budget.ts"
import type { AgentListIngredients, AgentListPreparations, AgentListRecipes } from "./schemas.ts"

/**
 * A página sai por `slice` em JS, e não por `LIMIT` no SQL, de propósito: o `total` do
 * envelope precisa ser o tamanho real do resultado (e, no caso das receitas, a dedup por
 * família só existe depois de ler a linhagem inteira). São catálogos de ~2.000 linhas
 * enxutas — a listagem de receitas mede 650 ms com a dedup incluída. Se algum deles crescer
 * uma ordem de grandeza, o caminho é `LIMIT` + `count()` em duas queries, não perder o total.
 */

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

/**
 * Nome da pasta de cada linha da página, resolvido em uma query só.
 *
 * Sem isto a pasta chega ao modelo como UUID, e UUID não tem como virar resposta: ou o
 * modelo imprime o identificador cru numa coluna que não diz nada a quem lê, ou omite o
 * agrupamento inteiro. Roda depois do `slice` — resolve os nomes da página, não do catálogo.
 *
 * Autorização: as linhas já passaram pelos guards da operation; o que se lê aqui é o nome da
 * pasta que a linha visível aponta.
 */
async function folderNames(db: SisubDb, ids: (string | null)[], table: typeof recipeFolderInKitchen | typeof folderInKitchen): Promise<Map<string, string>> {
	const unique = Array.from(new Set(ids.filter((id): id is string => id != null)))
	if (unique.length === 0) return new Map()
	const label = table === recipeFolderInKitchen ? recipeFolderInKitchen.name : folderInKitchen.description
	const rows = await runQuery("FETCH_FAILED", () => db.select({ id: table.id, label }).from(table).where(inArray(table.id, unique)))
	return new Map(rows.filter((r): r is { id: string; label: string } => r.label != null).map((r) => [r.id, r.label]))
}

/**
 * Receita na listagem: a pasta sai pelo nome e o `folder_id` não vai junto — nenhuma entrada
 * de tool filtra receita por pasta, então o UUID só serviria para o modelo copiar na resposta.
 * O `id` fica: é ele que a próxima chamada (`get_recipe`) precisa.
 */
export type AgentRecipeSummary = Omit<RecipeSummary, "folder_id"> & { folder: string | null }

export async function agentListRecipes(
	db: SisubDb,
	ctx: UserContext,
	input: AgentListRecipes & { globalOnly?: boolean }
): Promise<AgentList<AgentRecipeSummary>> {
	const limit = clampLimit(input.limit)
	// `?? undefined`: os schemas aceitam `null` porque é isso que modelo manda para "não
	// informado" — as operations tipam ausência como `undefined`.
	const rows = await listRecipeSummaries(db, ctx, { kitchenId: input.kitchenId ?? undefined, search: input.search ?? undefined, globalOnly: input.globalOnly })
	const page = paginate(rows, limit)
	const names = await folderNames(
		db,
		page.items.map((r) => r.folder_id),
		recipeFolderInKitchen
	)
	return { ...page, items: page.items.map(({ folder_id, ...recipe }) => ({ ...recipe, folder: folder_id == null ? null : (names.get(folder_id) ?? null) })) }
}

/**
 * Insumo/preparação na listagem: identificação e unidade — nutrientes e SKUs saem por `fetchIngredient`.
 *
 * Aqui o `folder_id` fica, ao contrário do da receita: `list_ingredients` aceita `folderId` como
 * filtro, e o modelo só tem como preenchê-lo se tiver visto o UUID em alguma listagem.
 */
export interface AgentIngredientSummary {
	id: string
	description: string | null
	measure_unit: string | null
	folder_id: string | null
	folder: string | null
}

function slimIngredient(row: {
	id: string
	description: string | null
	measure_unit: string | null
	folder_id: string | null
}): Omit<AgentIngredientSummary, "folder"> {
	return { id: row.id, description: row.description, measure_unit: row.measure_unit, folder_id: row.folder_id }
}

async function withFolderNames(db: SisubDb, page: AgentList<Omit<AgentIngredientSummary, "folder">>): Promise<AgentList<AgentIngredientSummary>> {
	const names = await folderNames(
		db,
		page.items.map((i) => i.folder_id),
		folderInKitchen
	)
	return { ...page, items: page.items.map((item) => ({ ...item, folder: item.folder_id == null ? null : (names.get(item.folder_id) ?? null) })) }
}

export async function agentListIngredients(db: SisubDb, ctx: UserContext, input: AgentListIngredients): Promise<AgentList<AgentIngredientSummary>> {
	const limit = clampLimit(input.limit)
	const rows = await listIngredients(db, ctx, { search: input.search ?? undefined, folderId: input.folderId ?? undefined })
	return withFolderNames(db, paginate(rows.map(slimIngredient), limit))
}

/** Linha da ficha técnica: o que entra, quanto entra e em que unidade. */
export interface AgentRecipeIngredient {
	name: string | null
	quantity: number | null
	measure_unit: string | null
	optional: boolean
	/** Preparação congelada em vez de insumo cru — a ficha aponta para uma OU para outro. */
	frozen_preparation: boolean
}

/** Ficha técnica como se lê: identificação, rendimento, modo de preparo e os insumos. */
export interface AgentRecipeDetail {
	id: string
	name: string
	version: number
	portion_yield: number | null
	preparation_time_minutes: number | null
	cooking_factor: number | null
	preparation_method: string | null
	kitchen_id: number | null
	ingredients: AgentRecipeIngredient[]
}

/**
 * Detalhe de uma receita para agente.
 *
 * `fetchRecipe` devolve a linha inteira de CADA insumo aninhada na ficha (12 colunas por
 * insumo, mais as 11 da linha de ficha técnica): ~23 campos para o modelo escrever
 * "500 g de arroz". Aqui sobra o que a resposta usa.
 */
export async function agentGetRecipe(db: SisubDb, ctx: UserContext, input: { recipeId: string }): Promise<AgentRecipeDetail> {
	const recipe = await fetchRecipe(db, ctx, { recipeId: input.recipeId })

	return {
		id: recipe.id,
		name: recipe.name,
		version: recipe.version,
		portion_yield: recipe.portion_yield == null ? null : Number(recipe.portion_yield),
		preparation_time_minutes: recipe.preparation_time_minutes,
		cooking_factor: recipe.cooking_factor == null ? null : Number(recipe.cooking_factor),
		preparation_method: recipe.preparation_method,
		kitchen_id: recipe.kitchen_id,
		ingredients: (recipe.ingredients ?? []).map((line) => ({
			name: line.ingredient?.description ?? line.frozen_preparation?.description ?? null,
			quantity: line.net_quantity == null ? null : Number(line.net_quantity),
			// A unidade da preparação congelada também vale: sem ela a linha chega ao modelo
			// como quantidade sem unidade e ele escreve "2 de molho base" — ou chuta kg/L.
			measure_unit: line.ingredient?.measure_unit ?? line.frozen_preparation?.measure_unit ?? null,
			optional: line.is_optional === true,
			frozen_preparation: line.frozen_preparation != null,
		})),
	}
}

/**
 * As preparações herdadas do SISUBWEB moram na tabela de insumos mas não são insumos —
 * `preparations: "only"` é o escopo que o catálogo já usa para separá-las.
 */
export async function agentListPreparations(db: SisubDb, ctx: UserContext, input: AgentListPreparations): Promise<AgentList<AgentIngredientSummary>> {
	const limit = clampLimit(input.limit)
	const rows = await listIngredients(db, ctx, { search: input.search ?? undefined, preparations: "only" })
	return withFolderNames(db, paginate(rows.map(slimIngredient), limit))
}
