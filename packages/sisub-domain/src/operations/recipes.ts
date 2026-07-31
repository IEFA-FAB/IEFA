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

import { menuTemplateInKitchen, menuTemplateItemsInKitchen, recipeIngredientsInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { FrozenPreparation, Ingredient, Recipe, RecipeIngredient } from "@iefa/database/sisub"
import { and, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm"
import { authorizeAssetMutation, requireAssetWriteForScope } from "../guards/asset-ownership.ts"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateRecipe,
	DeleteRecipe,
	FetchRecipe,
	ListRecipes,
	ListRecipeVersions,
	RenameRecipe,
	RestoreRecipe,
	SaveRecipeEdit,
} from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery, toWire } from "../utils/index.ts"
import { copyRecipeFlow } from "./recipe-flow.ts"

// ── Wire contract (snake_case aninhado, idêntico ao que o PostgREST devolvia) ──

type RecipeIngredientWire = RecipeIngredient & {
	ingredient: Ingredient | null
	// Preparação congelada segregada: uma linha de ficha técnica aponta OU p/ um insumo cru OU p/ uma preparação.
	frozen_preparation: FrozenPreparation | null
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

export async function fetchRecipe(db: SisubDb, ctx: UserContext, input: FetchRecipe): Promise<RecipeWithIngredients> {
	requirePermission(ctx, "kitchen", 1)

	// BUG FIX: filtra deleted_at IS NULL — sisub não filtrava.
	const where = and(eq(recipesInKitchen.id, input.recipeId), isNull(recipesInKitchen.deletedAt))
	const row = await runQuery("FETCH_FAILED", () => db.query.recipesInKitchen.findFirst({ where, with: WITH_INGREDIENTS }))

	if (!row) throw new NotFoundError("recipe", input.recipeId)

	scrubDeletedFrozenPreparations(row)
	return toWire<RecipeWithIngredients>(row, RECIPE_RELATIONS)
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
			return toWire<RecipeWithIngredients>(r, RECIPE_RELATIONS)
		})
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

	return rows.map((r) => toWire<RecipeWithIngredients>(r, RECIPE_RELATIONS))
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

	return inserted.map((r) => ({ id: r.id, ingredientId: r.ingredientId ?? "", priorityOrder: r.priorityOrder }))
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
				version: 1,
			})
			.returning()
	)

	await insertIngredients(db, recipe.id, input.ingredients)
	return toWire<Recipe>(recipe, RECIPE_RELATIONS)
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
			columns: { id: true, kitchenId: true, baseRecipeId: true },
			where: eq(recipesInKitchen.id, input.baseRecipeId),
		})
	)
	if (!base) throw new NotFoundError("recipe", input.baseRecipeId)

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
	await copyRecipeFlow(db, base.id, recipe.id, riIdMap)

	return { recipe: toWire<Recipe>(recipe, RECIPE_RELATIONS), forked }
}
