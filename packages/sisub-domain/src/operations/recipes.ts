/**
 * Recipe operations — Drizzle query layer (Fase 1 — piloto da migração PostgREST→Drizzle).
 *
 * Primeira operation migrada: troca o cliente PostgREST (`client: AnyClient`) pelo handle
 * Drizzle (`db: SisubDb`). O contrato de retorno é PRESERVADO (snake_case aninhado) via
 * `toWire()` — o Drizzle devolve colunas em camelCase, mas todo o app + os tipos
 * `Tables<"recipes">` consomem snake_case. Mudar o shape rippla pro frontend inteiro.
 *
 * Bug fix vs sisub original:
 *   - fetchRecipe: filtra deleted_at IS NULL (faltava no sisub — devolvia receitas no lixo).
 */

import {
	frozenPreparationInKitchen,
	ingredientInKitchen,
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	recipeFolderInKitchen,
	recipeIngredientAlternativesInKitchen,
	recipeIngredientsInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { FrozenPreparation, Ingredient, Recipe, RecipeFolder, RecipeIngredient } from "@iefa/database/sisub"
import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm"
import { authorizeAssetMutation, requireAssetWriteForScope } from "../guards/asset-ownership.ts"
import { requireAnyPermission, requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateRecipe,
	CreateRecipeFolder,
	DeleteRecipe,
	DeleteRecipeFolder,
	FetchRecipe,
	ListRecipeFolders,
	ListRecipes,
	ListRecipeVersions,
	RenameRecipe,
	RenameRecipeFolder,
	RestoreRecipe,
	SaveRecipeEdit,
	SetRecipeFolder,
} from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toNumeric, toWire, unwrapPgError } from "../utils/index.ts"
import { copyRecipeEquipmentRequirements } from "./equipment.ts"
import { copyRecipeFlow } from "./recipe-flow.ts"

// ── Wire contract (snake_case aninhado, idêntico ao que o PostgREST devolvia) ──

/**
 * Substituto de uma linha da ficha, já com o insumo resolvido para a tela.
 *
 * `net_quantity` é ABSOLUTA (a gramatura da substituta nesta preparação), não um fator —
 * ver `RecipeIngredientAlternativeSchema`.
 */
type RecipeIngredientAlternativeWire = {
	id: string
	ingredient_id: string | null
	frozen_preparation_id: string | null
	net_quantity: number | null
	priority_order: number | null
	ingredient: Ingredient | null
	frozen_preparation: FrozenPreparation | null
}

type RecipeIngredientWire = RecipeIngredient & {
	ingredient: Ingredient | null
	// Preparação congelada segregada: uma linha de ficha técnica aponta OU p/ um insumo cru OU p/ uma preparação.
	frozen_preparation: FrozenPreparation | null
	/**
	 * Substitutos desta linha. Opcional porque só `fetchRecipe` preenche: `listRecipes`
	 * devolve o catálogo inteiro, e ninguém lista substituto de 2.000 fichas de uma vez.
	 * Ver `attachAlternatives`.
	 */
	alternatives?: RecipeIngredientAlternativeWire[]
}
type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredientWire[] }

/**
 * Relations da query relacional do Drizzle nomeadas de forma "feia" pelo `drizzle-kit pull`.
 * Passadas a `toWire()` para renomear às chaves do contrato (o resto vira snake_case).
 */
const RECIPE_RELATIONS: Record<string, string> = {
	recipeIngredientsInKitchens: "ingredients",
	ingredientInKitchen: "ingredient",
	frozenPreparationInKitchen: "frozen_preparation",
}

// Relational `with` — nível ingredientes (com o insumo cru OU a preparação congelada de cada um).
// Profundidade 2 (recipe → recipe_ingredients → {ingredient|frozen_preparation}), dentro do
// limite de 63 chars de alias do Postgres — o problema de NAMEDATALEN é só a partir do nível 3.
const WITH_INGREDIENTS = { recipeIngredientsInKitchens: { with: { ingredientInKitchen: true, frozenPreparationInKitchen: true } } } as const

/**
 * Colunas `numeric` no caminho de leitura da receita (linha + ingrediente + insumo +
 * preparação congelada). O driver as devolve como STRING; o contrato `Tables<...>` diz
 * `number`. Ver `toNumeric` — é o que fazia o formulário da ficha técnica acusar
 * "Invalid input" em campo salvo e nunca tocado.
 */
const RECIPE_NUMERIC_KEYS: ReadonlySet<string> = new Set([
	"portion_yield",
	"cooking_factor",
	"net_quantity",
	"correction_factor",
	"rehydration_index",
	"density_factor",
	"yield_quantity",
	"storage_temperature_c",
])

/** `toWire` + normalização dos `numeric` — todo retorno de leitura de receita passa aqui. */
function toRecipeWire<T>(row: unknown): T {
	return toNumeric(toWire<T>(row, RECIPE_RELATIONS), RECIPE_NUMERIC_KEYS)
}

/**
 * O Drizzle não aceita `where` numa relação `one` (só em `many`), então a preparação
 * congelada é eager-loaded sem filtro. Zeramos aqui as soft-deletadas p/ não vazarem pela
 * relação — consistente com list/fetch que filtram `deleted_at IS NULL`.
 */
function scrubDeletedFrozenPreparations(row: { recipeIngredientsInKitchens?: unknown } | null | undefined): void {
	const ingredients = (row?.recipeIngredientsInKitchens ?? []) as Array<{
		frozenPreparationInKitchen?: { deletedAt?: string | null } | null
	}>
	for (const ri of ingredients) {
		if (ri.frozenPreparationInKitchen?.deletedAt) ri.frozenPreparationInKitchen = null
	}
}

/**
 * Carrega os substitutos das linhas informadas e os pendura em `alternatives`.
 *
 * Query SEPARADA de propósito. Pelo `with` relacional isto seria o nível 3
 * (recipe → recipe_ingredients → alternatives → ingredient) e o alias gerado pelo Drizzle
 * passa dos 63 caracteres do NAMEDATALEN do Postgres — o mesmo teto que já obrigou a
 * quebrar as consultas de produção/ata/procurement. O erro que ele produz fala de coluna
 * inexistente, não de tamanho de alias, então vale a query a mais.
 *
 * Só `fetchRecipe` chama: `listRecipes` devolve o catálogo inteiro (~2.000 fichas) e
 * ninguém lista substituto de todas elas.
 */
async function attachAlternatives(db: SisubDb, ingredients: RecipeIngredientWire[]): Promise<void> {
	for (const ri of ingredients) ri.alternatives = []
	const ids = ingredients.map((ri) => ri.id).filter((id): id is string => !!id)
	if (ids.length === 0) return

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: recipeIngredientAlternativesInKitchen.id,
				recipe_ingredient_id: recipeIngredientAlternativesInKitchen.recipeIngredientId,
				ingredient_id: recipeIngredientAlternativesInKitchen.ingredientId,
				frozen_preparation_id: recipeIngredientAlternativesInKitchen.frozenPreparationId,
				net_quantity: recipeIngredientAlternativesInKitchen.netQuantity,
				priority_order: recipeIngredientAlternativesInKitchen.priorityOrder,
				ingredient: ingredientInKitchen,
				frozen_preparation: frozenPreparationInKitchen,
			})
			.from(recipeIngredientAlternativesInKitchen)
			.leftJoin(ingredientInKitchen, eq(ingredientInKitchen.id, recipeIngredientAlternativesInKitchen.ingredientId))
			.leftJoin(frozenPreparationInKitchen, eq(frozenPreparationInKitchen.id, recipeIngredientAlternativesInKitchen.frozenPreparationId))
			.where(inArray(recipeIngredientAlternativesInKitchen.recipeIngredientId, ids))
			.orderBy(asc(recipeIngredientAlternativesInKitchen.priorityOrder), asc(recipeIngredientAlternativesInKitchen.createdAt))
	)

	const byLine = new Map<string, RecipeIngredientAlternativeWire[]>()
	for (const row of rows) {
		// O insumo/preparação vem do join em camelCase; `toWire` o converte para o contrato.
		const wire = toRecipeWire<RecipeIngredientAlternativeWire>({
			id: row.id,
			ingredientId: row.ingredient_id,
			frozenPreparationId: row.frozen_preparation_id,
			netQuantity: row.net_quantity,
			priorityOrder: row.priority_order,
			// Substituta soft-deletada não vaza pela relação (o `leftJoin` não filtra).
			ingredientInKitchen: row.ingredient?.deletedAt ? null : row.ingredient,
			frozenPreparationInKitchen: row.frozen_preparation?.deletedAt ? null : row.frozen_preparation,
		})
		const bucket = byLine.get(row.recipe_ingredient_id)
		if (bucket) bucket.push(wire)
		else byLine.set(row.recipe_ingredient_id, [wire])
	}

	for (const ri of ingredients) ri.alternatives = byLine.get(ri.id) ?? []
}

export async function fetchRecipe(db: SisubDb, ctx: UserContext, input: FetchRecipe): Promise<RecipeWithIngredients> {
	// Mesmo critério de `listRecipeSummaries`: quem administra o catálogo (global) não tem
	// cozinha nenhuma, e exigir `kitchen:1` trancava esse usuário fora da receita que ele
	// acabou de listar. Ler a ficha de UMA receita é menos do que listar o catálogo inteiro,
	// que `global:1` já pode.
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	// BUG FIX: filtra deleted_at IS NULL — sisub não filtrava.
	const where = and(eq(recipesInKitchen.id, input.recipeId), isNull(recipesInKitchen.deletedAt))
	const row = await runQuery("FETCH_FAILED", () => db.query.recipesInKitchen.findFirst({ where, with: WITH_INGREDIENTS }))

	if (!row) throw new NotFoundError("recipe", input.recipeId)

	scrubDeletedFrozenPreparations(row)
	const recipe = toRecipeWire<RecipeWithIngredients>(row)
	await attachAlternatives(db, recipe.ingredients)
	return recipe
}

/**
 * Precedência dentro de uma linhagem, para a dedup da listagem.
 *
 * A linha LOCAL sombreia a global **incondicionalmente** — semântica de branch de git: o
 * fork da cozinha vence o upstream na visão dela. Entre linhas do mesmo escopo, vence a
 * maior versão.
 *
 * Comparar apenas `version` (comportamento anterior) empatava fork e global quando os dois
 * chegavam ao mesmo número, e o vencedor passava a depender da ordem em que o Postgres
 * devolvia as linhas — não-determinístico. A listagem de uma cozinha só traz o global e as
 * linhas dela própria, então "local" aqui só pode ser a cozinha que consultou.
 */
function lineageWinner(candidate: { kitchenId: number | null; version: number }, incumbent: { kitchenId: number | null; version: number }): boolean {
	const candidateIsLocal = candidate.kitchenId != null
	if (candidateIsLocal !== (incumbent.kitchenId != null)) return candidateIsLocal
	return candidate.version > incumbent.version
}

export async function listRecipes(db: SisubDb, ctx: UserContext, input: ListRecipes): Promise<RecipeWithIngredients[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const conditions: (SQL | undefined)[] = []
	if (!input.includeDeleted) conditions.push(isNull(recipesInKitchen.deletedAt))
	if (input.kitchenId != null && !input.globalOnly) {
		conditions.push(or(isNull(recipesInKitchen.kitchenId), eq(recipesInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(recipesInKitchen.kitchenId))
	}
	if (input.search) conditions.push(ilike(recipesInKitchen.name, `%${input.search}%`))

	// Sem orderBy no SQL: o sort pt-BR em JS (após o dedup) determina a ordem final;
	// ordenar no Postgres seria um passo sem efeito observável.
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findMany({
			where: and(...conditions),
			with: WITH_INGREDIENTS,
		})
	)

	// Dedup por família: uma linha por linhagem (versões inserem novas linhas com
	// base_recipe_id → raiz). Opera sobre as linhas Drizzle (camelCase) e só converte
	// para o contrato no final.
	const familyMap = new Map<string, (typeof rows)[number]>()
	for (const recipe of rows) {
		const rootId = recipe.baseRecipeId ?? recipe.id
		const existing = familyMap.get(rootId)
		if (!existing || lineageWinner(recipe, existing)) familyMap.set(rootId, recipe)
	}

	return Array.from(familyMap.values())
		.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
		.map((r) => {
			scrubDeletedFrozenPreparations(r)
			return toRecipeWire<RecipeWithIngredients>(r)
		})
}

/** Linha da listagem sem ficha técnica: identificação, rendimento e onde a receita mora. */
export type RecipeSummary = Pick<Recipe, "id" | "name" | "version" | "portion_yield" | "preparation_time_minutes" | "kitchen_id" | "folder_id">

/**
 * Mesma listagem de `listRecipes` — mesmos guards, mesmos filtros, mesma dedup por
 * família — sem carregar a ficha técnica de cada receita.
 *
 * Existe porque o catálogo tem ~2.000 receitas: com os ingredientes aninhados a resposta
 * passa de 10 MB, o que nenhum consumidor de listagem precisa e nenhum agente aguenta
 * (o provider recusa o turno seguinte). Quem quer o detalhe chama `fetchRecipe`.
 */
export async function listRecipeSummaries(db: SisubDb, ctx: UserContext, input: ListRecipes): Promise<RecipeSummary[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		// Sem cozinha, a listagem é do catálogo global — quem administra o catálogo (global)
		// chega por aqui sem ter nenhuma cozinha. Exigir `kitchen:1`, como faz `listRecipes`,
		// trancava o usuário só-global fora da própria listagem dele. Mesmo critério do
		// catálogo de insumos.
		requireAnyPermission(ctx, ["kitchen", "global"], 1)
	}

	const conditions: (SQL | undefined)[] = []
	if (!input.includeDeleted) conditions.push(isNull(recipesInKitchen.deletedAt))
	if (input.kitchenId != null && !input.globalOnly) {
		conditions.push(or(isNull(recipesInKitchen.kitchenId), eq(recipesInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(recipesInKitchen.kitchenId))
	}
	if (input.search) conditions.push(ilike(recipesInKitchen.name, `%${input.search}%`))

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: recipesInKitchen.id,
				name: recipesInKitchen.name,
				version: recipesInKitchen.version,
				portionYield: recipesInKitchen.portionYield,
				preparationTimeMinutes: recipesInKitchen.preparationTimeMinutes,
				kitchenId: recipesInKitchen.kitchenId,
				folderId: recipesInKitchen.folderId,
				baseRecipeId: recipesInKitchen.baseRecipeId,
			})
			.from(recipesInKitchen)
			.where(and(...conditions))
	)

	// Dedup por família — idêntica à de `listRecipes`: uma linha por linhagem.
	const familyMap = new Map<string, (typeof rows)[number]>()
	for (const recipe of rows) {
		const rootId = recipe.baseRecipeId ?? recipe.id
		const existing = familyMap.get(rootId)
		if (!existing || lineageWinner(recipe, existing)) familyMap.set(rootId, recipe)
	}

	return Array.from(familyMap.values())
		.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
		.map(({ baseRecipeId: _baseRecipeId, ...summary }) => toNumeric(toWire<RecipeSummary>(summary), RECIPE_NUMERIC_KEYS))
}

/**
 * Retorna os IDs das preparações usadas em pelo menos um plano semanal (menu_template
 * com template_type "weekly" e não excluído). Usado para sinalizar, na listagem de
 * preparações, quais merecem revisão prioritária por estarem em cardápios semanais.
 *
 * Sem escopo de cozinha: uma preparação global pode ser usada em um plano semanal de
 * qualquer cozinha. Autorização garantida por `requirePermission` — com Drizzle
 * (conexão direta pelo role do projeto) não há RLS; a autorização é só na aplicação.
 */
export async function listRecipeMenuUsage(db: SisubDb, ctx: UserContext): Promise<string[]> {
	requirePermission(ctx, "kitchen", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ recipeId: menuTemplateItemsInKitchen.recipeId })
			.from(menuTemplateItemsInKitchen)
			.innerJoin(menuTemplateInKitchen, eq(menuTemplateItemsInKitchen.menuTemplateId, menuTemplateInKitchen.id))
			.where(and(eq(menuTemplateInKitchen.templateType, "weekly"), isNull(menuTemplateInKitchen.deletedAt), isNotNull(menuTemplateItemsInKitchen.recipeId)))
	)

	const ids = new Set<string>()
	for (const row of rows) {
		if (row.recipeId) ids.add(row.recipeId)
	}
	return Array.from(ids)
}

export async function listRecipeVersions(db: SisubDb, ctx: UserContext, input: ListRecipeVersions): Promise<RecipeWithIngredients[]> {
	requirePermission(ctx, "kitchen", 1)

	const root = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({ columns: { id: true, baseRecipeId: true }, where: eq(recipesInKitchen.id, input.recipeId) })
	)
	if (!root) throw new NotFoundError("recipe", input.recipeId)

	const rootId = root.baseRecipeId ?? root.id

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findMany({
			where: or(eq(recipesInKitchen.id, rootId), eq(recipesInKitchen.baseRecipeId, rootId)),
			with: WITH_INGREDIENTS,
			orderBy: (recipe, { asc }) => [asc(recipe.version)],
		})
	)

	return rows.map((r) => toRecipeWire<RecipeWithIngredients>(r))
}

// ── Pastas de preparação (agrupamento plano — organização e filtragem) ───────
//
// Deliberadamente mais simples que `kitchen.folder` (pastas de insumo): sem hierarquia, sem
// caminho, sem herança. A pasta é um rótulo; a listagem continua sendo uma lista.
//
// Autorização em dois níveis distintos:
//   - o CONJUNTO de pastas é catálogo (criar/renomear/excluir → `global:2`);
//   - ARQUIVAR uma preparação segue a posse dela (`authorizeAssetMutation`), então uma cozinha
//     organiza as próprias preparações sem poder alterar as pastas de ninguém.

/** Violação da unicidade de nome entre pastas ATIVAS (índice parcial). */
function isDuplicateFolderName(error: unknown): boolean {
	const pg = unwrapPgError(error)
	return pg.code === "23505" && (pg.constraint_name ?? "").startsWith("recipe_folder_name_active")
}

/**
 * Garante que a pasta destino existe e está ativa. A FK sozinha barra id inexistente, mas
 * aceitaria uma pasta soft-deletada — a preparação sumiria num agrupamento invisível.
 */
async function assertActiveRecipeFolder(db: SisubDb, folderId: string): Promise<void> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.recipeFolderInKitchen.findFirst({
			columns: { id: true },
			where: and(eq(recipeFolderInKitchen.id, folderId), isNull(recipeFolderInKitchen.deletedAt)),
		})
	)
	if (!row) throw new NotFoundError("recipe_folder", folderId)
}

export async function listRecipeFolders(db: SisubDb, ctx: UserContext, input?: ListRecipeFolders): Promise<RecipeFolder[]> {
	// Mesmo nível de leitura de `listRecipes`: quem enxerga preparações enxerga o agrupamento delas.
	requirePermission(ctx, "kitchen", 1)
	const where = input?.includeDeleted ? undefined : isNull(recipeFolderInKitchen.deletedAt)
	const rows = await runQuery("FETCH_FAILED", () => db.select().from(recipeFolderInKitchen).where(where).orderBy(asc(recipeFolderInKitchen.name)))
	return rows.map((r) => toWire<RecipeFolder>(r))
}

export async function createRecipeFolder(db: SisubDb, ctx: UserContext, input: CreateRecipeFolder): Promise<RecipeFolder> {
	requirePermission(ctx, "global", 2)
	try {
		const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () => db.insert(recipeFolderInKitchen).values({ name: input.name }).returning())
		return toWire<RecipeFolder>(row)
	} catch (error) {
		if (isDuplicateFolderName(error)) throw new DomainError("RECIPE_FOLDER_DUPLICATE", `Já existe uma pasta chamada "${input.name}"`)
		throw error
	}
}

export async function renameRecipeFolder(db: SisubDb, ctx: UserContext, input: RenameRecipeFolder): Promise<RecipeFolder> {
	requirePermission(ctx, "global", 2)
	try {
		const [row] = await mutateOrFail("UPDATE_FAILED", `recipe_folder ${input.id} not found`, () =>
			db
				.update(recipeFolderInKitchen)
				.set({ name: input.name })
				.where(and(eq(recipeFolderInKitchen.id, input.id), isNull(recipeFolderInKitchen.deletedAt)))
				.returning()
		)
		return toWire<RecipeFolder>(row)
	} catch (error) {
		if (isDuplicateFolderName(error)) throw new DomainError("RECIPE_FOLDER_DUPLICATE", `Já existe uma pasta chamada "${input.name}"`)
		throw error
	}
}

/**
 * Exclui (soft) uma pasta e, na MESMA transação, desarquiva as preparações que estavam nela.
 *
 * Excluir só a pasta deixaria as preparações apontando para um agrupamento que nenhuma tela
 * lista — elas sumiriam de todos os filtros por pasta e continuariam fora de "Sem pasta".
 * Como a pasta é só um rótulo, apagá-lo devolve as preparações ao estado "sem pasta".
 *
 * @returns quantas preparações foram desarquivadas.
 */
export async function deleteRecipeFolder(db: SisubDb, ctx: UserContext, input: DeleteRecipeFolder): Promise<{ unfiled: number }> {
	requirePermission(ctx, "global", 2)
	return db.transaction(async (tx) => {
		const unfiled = await tx
			.update(recipesInKitchen)
			.set({ folderId: null })
			.where(eq(recipesInKitchen.folderId, input.id))
			.returning({ id: recipesInKitchen.id })

		const deleted = await tx
			.update(recipeFolderInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(recipeFolderInKitchen.id, input.id), isNull(recipeFolderInKitchen.deletedAt)))
			.returning({ id: recipeFolderInKitchen.id })

		if (deleted.length === 0) throw new NotFoundError("recipe_folder", input.id)
		return { unfiled: unfiled.length }
	})
}

/**
 * Arquiva preparações numa pasta (ou as tira de qualquer pasta com `folderId: null`).
 *
 * Opera sobre as LINHAS informadas, não sobre a linhagem inteira: a pasta é metadado da versão
 * e é copiada adiante por `saveRecipeEdit`. Arquivar a versão vigente (a que a listagem mostra)
 * é o suficiente, e o fork local de uma cozinha pode ficar em pasta diferente da global.
 *
 * Autoriza TODAS as preparações antes de escrever qualquer uma — um lote parcialmente aplicado
 * seria pior que a recusa inteira, e a posse vem sempre da linha persistida (nunca do input).
 */
export async function setRecipeFolder(db: SisubDb, ctx: UserContext, input: SetRecipeFolder): Promise<{ updated: number }> {
	const ids = Array.from(new Set(input.recipeIds))

	const owners = await runQuery("FETCH_FAILED", () =>
		db.select({ id: recipesInKitchen.id, kitchenId: recipesInKitchen.kitchenId }).from(recipesInKitchen).where(inArray(recipesInKitchen.id, ids))
	)
	const ownerById = new Map(owners.map((r) => [r.id, r.kitchenId]))
	for (const id of ids) {
		if (!ownerById.has(id)) throw new NotFoundError("recipe", id)
		requireAssetWriteForScope(ctx, ownerById.get(id) ?? null)
	}

	if (input.folderId != null) await assertActiveRecipeFolder(db, input.folderId)

	const rows = await runQuery("UPDATE_FAILED", () =>
		db.update(recipesInKitchen).set({ folderId: input.folderId }).where(inArray(recipesInKitchen.id, ids)).returning({ id: recipesInKitchen.id })
	)
	return { updated: rows.length }
}

/** Linha de insumo recém-inserida — usada para mapear insumo antigo → novo no copy-forward do fluxo. */
type InsertedIngredient = { id: string; ingredientId: string; priorityOrder: number | null }

async function insertIngredients(db: SisubDb, recipeId: string, ingredients: CreateRecipe["ingredients"]): Promise<InsertedIngredient[]> {
	if (!ingredients?.length) return []

	const rows = ingredients.map((ing) => ({
		recipeId,
		ingredientId: ing.ingredientId,
		netQuantity: String(ing.netQuantity),
		isOptional: ing.isOptional,
		priorityOrder: ing.priorityOrder,
		// Fatores por ingrediente da preparação (opcionais): null = herda o insumo / vale 1.
		correctionFactor: ing.correctionFactor != null ? String(ing.correctionFactor) : null,
		rehydrationIndex: ing.rehydrationIndex != null ? String(ing.rehydrationIndex) : null,
	}))
	// INSERT ... RETURNING devolve as linhas na ordem de inserção — usado para mapear
	// insumo antigo → novo no copy-forward do fluxo de produção.
	const inserted = await runQuery("INSERT_INGREDIENTS_FAILED", () =>
		db.insert(recipeIngredientsInKitchen).values(rows).returning({
			id: recipeIngredientsInKitchen.id,
			ingredientId: recipeIngredientsInKitchen.ingredientId,
			priorityOrder: recipeIngredientsInKitchen.priorityOrder,
		})
	)
	if (inserted.length !== rows.length) throw new DomainError("INSERT_INGREDIENTS_FAILED", "row count mismatch")

	await insertAlternatives(db, ingredients, inserted)

	return inserted.map((r) => ({ id: r.id, ingredientId: r.ingredientId ?? "", priorityOrder: r.priorityOrder }))
}

/**
 * Substitutos das linhas recém-inseridas, casados pela ORDEM do `RETURNING`.
 *
 * O casamento é posicional porque é o único disponível: as linhas ainda não têm id no
 * payload, e `ingredientId` sozinho não identifica (o mesmo insumo pode entrar duas vezes
 * na ficha). O `RETURNING` do Postgres devolve na ordem inserida, que é a ordem do array.
 *
 * Um substituto igual ao insumo da própria linha é descartado — "arroz substitui arroz"
 * não diz nada, e o índice único não o pegaria (é uma linha só). Duplicata do mesmo
 * substituto na mesma linha também sai aqui; deixá-la para o índice único transformaria
 * um clique repetido na tela em 23505 sem mensagem.
 */
async function insertAlternatives(db: SisubDb, ingredients: NonNullable<CreateRecipe["ingredients"]>, inserted: { id: string }[]): Promise<void> {
	const rows: { recipeIngredientId: string; ingredientId: string; netQuantity: string; priorityOrder: number }[] = []

	ingredients.forEach((ing, index) => {
		const line = inserted[index]
		if (!line || !ing.alternatives?.length) return
		const seen = new Set<string>()
		for (const alt of ing.alternatives) {
			if (alt.ingredientId === ing.ingredientId || seen.has(alt.ingredientId)) continue
			seen.add(alt.ingredientId)
			rows.push({
				recipeIngredientId: line.id,
				ingredientId: alt.ingredientId,
				netQuantity: String(alt.netQuantity),
				priorityOrder: alt.priorityOrder,
			})
		}
	})

	if (rows.length === 0) return
	await runQuery("INSERT_ALTERNATIVES_FAILED", () => db.insert(recipeIngredientAlternativesInKitchen).values(rows))
}

/**
 * Mapeia recipe_ingredient_id da versão-fonte → da versão nova, casando por
 * `ingredientId:priorityOrder`. Base do copy-forward do fluxo de produção.
 */
async function buildIngredientIdMap(db: SisubDb, sourceRecipeId: string, inserted: InsertedIngredient[]): Promise<Map<string, string>> {
	const oldRows = await runQuery("FETCH_FAILED", () =>
		db.query.recipeIngredientsInKitchen.findMany({
			columns: { id: true, ingredientId: true, priorityOrder: true },
			where: and(eq(recipeIngredientsInKitchen.recipeId, sourceRecipeId), isNull(recipeIngredientsInKitchen.deletedAt)),
		})
	)
	const key = (ingredientId: string | null, priorityOrder: number | null) => `${ingredientId ?? ""}:${priorityOrder ?? ""}`
	const newByKey = new Map(inserted.map((r) => [key(r.ingredientId, r.priorityOrder), r.id]))
	const map = new Map<string, string>()
	for (const old of oldRows) {
		const newId = newByKey.get(key(old.ingredientId, old.priorityOrder))
		if (newId) map.set(old.id, newId)
	}
	return map
}

export async function createRecipe(db: SisubDb, ctx: UserContext, input: CreateRecipe): Promise<Recipe> {
	// kitchenId ausente = receita GLOBAL (catálogo da SDAB) → exige global:2, não kitchen:2.
	requireAssetWriteForScope(ctx, input.kitchenId ?? null)

	if (input.folderId != null) await assertActiveRecipeFolder(db, input.folderId)

	const recipe = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(recipesInKitchen)
			.values({
				name: input.name,
				preparationMethod: input.preparationMethod ?? null,
				portionYield: String(input.portionYield),
				preparationTimeMinutes: input.preparationTimeMinutes ?? null,
				cookingFactor: input.cookingFactor != null ? String(input.cookingFactor) : null,
				rationalId: input.rationalId ?? null,
				kitchenId: input.kitchenId ?? null,
				folderId: input.folderId ?? null,
				version: 1,
			})
			.returning()
	)

	await insertIngredients(db, recipe.id, input.ingredients)
	return toRecipeWire<Recipe>(recipe)
}

/**
 * Autoriza mutação destrutiva sobre UMA receita conforme a posse:
 * receita local → exige nível 2 NAQUELA cozinha; receita global → exige "global" nível 2.
 * Evita IDOR: sem isso, qualquer usuário kitchen-2 apagaria receitas de outras cozinhas/globais.
 *
 * Delega ao guard compartilhado — este comportamento era o correto e virou a regra geral
 * para todo ativo global/local (ver guards/asset-ownership.ts).
 */
async function authorizeRecipeMutation(db: SisubDb, ctx: UserContext, recipeId: string): Promise<void> {
	await authorizeAssetMutation(db, ctx, "recipe", recipeId)
}

/** Soft delete: marca deleted_at. A receita some das listagens (exceto includeDeleted). */
export async function deleteRecipe(db: SisubDb, ctx: UserContext, input: DeleteRecipe): Promise<void> {
	await authorizeRecipeMutation(db, ctx, input.id)
	await runQuery("DELETE_FAILED", () =>
		db
			.update(recipesInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(recipesInKitchen.id, input.id))
			.then(() => undefined)
	)
}

/** Restaura uma receita previamente excluída (deleted_at = null). */
export async function restoreRecipe(db: SisubDb, ctx: UserContext, input: RestoreRecipe): Promise<void> {
	await authorizeRecipeMutation(db, ctx, input.id)
	await runQuery("RESTORE_FAILED", () =>
		db
			.update(recipesInKitchen)
			.set({ deletedAt: null })
			.where(eq(recipesInKitchen.id, input.id))
			.then(() => undefined)
	)
}

/** Renomeia uma receita in-place (não cria versão). Usado por localizar e substituir. */
export async function renameRecipe(db: SisubDb, ctx: UserContext, input: RenameRecipe): Promise<void> {
	await authorizeRecipeMutation(db, ctx, input.id)
	await runQuery("UPDATE_FAILED", () =>
		db
			.update(recipesInKitchen)
			.set({ name: input.name })
			.where(eq(recipesInKitchen.id, input.id))
			.then(() => undefined)
	)
}

/** Resultado de uma edição salva: a linha criada e se ela nasceu como fork local. */
export type SaveRecipeEditResult = { recipe: Recipe; forked: boolean }

/**
 * Salva a edição de uma receita existente, criando uma nova linha na linhagem.
 *
 * Três caminhos, decididos pelo DONO da base e pelo CONTEXTO declarado na requisição:
 *
 *  1. base global + contexto global   → nova versão global (exige `global:2`)
 *  2. base global + contexto cozinha  → **fork local** (copy-on-write): o global fica
 *     intacto e a cozinha ganha a própria linha. Exige `kitchen:2` naquela cozinha.
 *  3. base local  + contexto da mesma cozinha → nova versão do ativo local
 *
 * Base local com contexto de outra cozinha (ou contexto global) é rejeitada: nem editar
 * receita alheia, nem promover adaptação local a conteúdo da FAB.
 *
 * `base_recipe_id` aponta sempre para a RAIZ da linhagem, não para o pai imediato. A
 * dedup da listagem e `listRecipeVersions` resolvem família por `base_recipe_id ?? id` em
 * um único nível — com o pai imediato, a partir da terceira versão a família se partia e
 * duas versões apareciam na listagem ao mesmo tempo.
 *
 * O número de versão é por ESCOPO: a linhagem do fork tem contador próprio e não compete
 * com a do global (a precedência do fork não depende de número de versão — ver `listRecipes`).
 */
export async function saveRecipeEdit(db: SisubDb, ctx: UserContext, input: SaveRecipeEdit): Promise<SaveRecipeEditResult> {
	const targetKitchenId = input.context.scope === "kitchen" ? input.context.kitchenId : null

	// Autorização ANTES de qualquer leitura: os erros seguintes distinguem "não existe" de
	// "é de outra cozinha", e emiti-los primeiro contaria a um usuário sem acesso se um
	// UUID de receita existe e de quem ele é. O destino sai do contexto declarado, então dá
	// para autorizar sem tocar o banco.
	requireAssetWriteForScope(ctx, targetKitchenId)

	const base = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({
			columns: { id: true, kitchenId: true, baseRecipeId: true, folderId: true },
			where: eq(recipesInKitchen.id, input.baseRecipeId),
		})
	)
	if (!base) throw new NotFoundError("recipe", input.baseRecipeId)

	// Pasta é metadado de agrupamento, não conteúdo da ficha: omitir preserva a da versão base
	// (senão toda edição desarquivaria a preparação), `null` explícito tira de qualquer pasta.
	const folderId = input.folderId !== undefined ? input.folderId : base.folderId
	if (folderId != null) await assertActiveRecipeFolder(db, folderId)

	const rootId = base.baseRecipeId ?? base.id

	if (base.kitchenId != null && base.kitchenId !== targetKitchenId) {
		throw new DomainError(
			"RECIPE_SCOPE_MISMATCH",
			`Recipe ${input.baseRecipeId} belongs to kitchen ${base.kitchenId} and cannot be edited from ${
				targetKitchenId == null ? "the global context" : `kitchen ${targetKitchenId}`
			}`
		)
	}

	const forked = base.kitchenId == null && targetKitchenId != null

	// Alocação de versão + insert na MESMA transação, sob advisory lock da linhagem. Sem o
	// lock, dois saves concorrentes no mesmo escopo leem o mesmo máximo e inserem a mesma
	// versão: a listagem passaria a escolher uma das duas arbitrariamente e o histórico
	// mostraria números repetidos. O lock é liberado no commit/rollback.
	const recipe = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recipe-lineage:${rootId}`}))`)

		// Linhagem completa (raiz + descendentes) para achar o próximo número de versão no
		// escopo de destino. Um fork já existente desta cozinha aparece aqui, então a edição
		// seguinte versiona esse fork em vez de bifurcar de novo.
		const lineage = await tx
			.select({ kitchenId: recipesInKitchen.kitchenId, version: recipesInKitchen.version })
			.from(recipesInKitchen)
			.where(or(eq(recipesInKitchen.id, rootId), eq(recipesInKitchen.baseRecipeId, rootId)))

		const nextVersion = lineage.filter((r) => r.kitchenId === targetKitchenId).reduce((max, r) => Math.max(max, r.version), 0) + 1

		const [row] = await tx
			.insert(recipesInKitchen)
			.values({
				name: input.name,
				preparationMethod: input.preparationMethod ?? null,
				portionYield: String(input.portionYield),
				preparationTimeMinutes: input.preparationTimeMinutes ?? null,
				cookingFactor: input.cookingFactor != null ? String(input.cookingFactor) : null,
				rationalId: input.rationalId ?? null,
				kitchenId: targetKitchenId,
				folderId,
				baseRecipeId: rootId,
				version: nextVersion,
			})
			.returning()

		if (!row) throw new DomainError("INSERT_FAILED", "no row returned")
		return row
	})

	const inserted = await insertIngredients(db, recipe.id, input.ingredients)

	// Copy-forward do fluxo de produção a partir da versão que o usuário abriu, remapeando
	// os insumos. Não-atômico com o insert da linha (paridade com o comportamento anterior):
	// falha aqui não desfaz a linha criada — o fluxo pode ser re-salvo manualmente.
	const riIdMap = await buildIngredientIdMap(db, base.id, inserted)
	const stepIdMap = await copyRecipeFlow(db, base.id, recipe.id, riIdMap)
	// A lista mínima de equipamentos acompanha a versão; exigência amarrada a etapa é reapontada
	// pelo mapa do fluxo. Mesma não-atomicidade do copy-forward do fluxo.
	await copyRecipeEquipmentRequirements(db, base.id, recipe.id, stepIdMap)

	return { recipe: toRecipeWire<Recipe>(recipe), forked }
}
