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
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	recipeIngredientAlternativesInKitchen,
	recipeIngredientsInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { FrozenPreparation, Ingredient, Recipe, RecipeIngredient, RecipeIngredientAlternative } from "@iefa/database/sisub"
import { and, eq, ilike, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateRecipe,
	CreateRecipeVersion,
	DeleteRecipe,
	FetchRecipe,
	ListRecipes,
	ListRecipeVersions,
	RenameRecipe,
	RestoreRecipe,
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
	alternatives?: (RecipeIngredientAlternative & { ingredient: Ingredient | null; frozen_preparation: FrozenPreparation | null })[]
}
type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredientWire[] }

/**
 * Relations da query relacional do Drizzle nomeadas de forma "feia" pelo `drizzle-kit pull`.
 * Passadas a `toWire()` para renomear às chaves do contrato (o resto vira snake_case).
 */
const RECIPE_RELATIONS: Record<string, string> = {
	recipeIngredientsInKitchens: "ingredients",
	recipeIngredientAlternativesInKitchens: "alternatives",
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
		recipeIngredientAlternativesInKitchens?: Array<{ frozenPreparationInKitchen?: { deletedAt?: string | null } | null }>
	}>
	for (const ri of ingredients) {
		if (ri.frozenPreparationInKitchen?.deletedAt) ri.frozenPreparationInKitchen = null
		for (const alt of ri.recipeIngredientAlternativesInKitchens ?? []) {
			if (alt.frozenPreparationInKitchen?.deletedAt) alt.frozenPreparationInKitchen = null
		}
	}
}

export async function fetchRecipe(db: SisubDb, ctx: UserContext, input: FetchRecipe): Promise<RecipeWithIngredients> {
	requirePermission(ctx, "kitchen", 1)

	// BUG FIX: filtra deleted_at IS NULL — sisub não filtrava.
	const where = and(eq(recipesInKitchen.id, input.recipeId), isNull(recipesInKitchen.deletedAt))
	const row = await runQuery("FETCH_FAILED", () => db.query.recipesInKitchen.findFirst({ where, with: WITH_INGREDIENTS }))

	if (!row) throw new NotFoundError("recipe", input.recipeId)

	// Alternativas em query SEPARADA — NÃO aninhar no relational query acima.
	// recipe → recipe_ingredients → alternatives → ingredient é fundo demais: o Drizzle
	// concatena o caminho das relations no alias da tabela e o nome estoura o limite de
	// 63 chars de identificador do Postgres (NAMEDATALEN), que trunca silenciosamente →
	// aliases divergem/colidem e a query inteira quebra (detalhe da preparação nunca carrega).
	// Buscamos as alternativas dos recipe_ingredients desta receita (profundidade 2, dentro
	// do limite) e costuramos no shape que o toWire/contrato espera.
	if (input.includeAlternatives) {
		const ingredientRows = row.recipeIngredientsInKitchens ?? []
		const riIds = ingredientRows.map((ri) => ri.id)
		if (riIds.length > 0) {
			const alts = await runQuery("FETCH_FAILED", () =>
				db.query.recipeIngredientAlternativesInKitchen.findMany({
					where: inArray(recipeIngredientAlternativesInKitchen.recipeIngredientId, riIds),
					with: { ingredientInKitchen: true, frozenPreparationInKitchen: true },
				})
			)
			const byRecipeIngredient = new Map<string, typeof alts>()
			for (const alt of alts) {
				if (!alt.recipeIngredientId) continue
				const bucket = byRecipeIngredient.get(alt.recipeIngredientId)
				if (bucket) bucket.push(alt)
				else byRecipeIngredient.set(alt.recipeIngredientId, [alt])
			}
			for (const ri of ingredientRows) {
				;(ri as typeof ri & { recipeIngredientAlternativesInKitchens: typeof alts }).recipeIngredientAlternativesInKitchens =
					byRecipeIngredient.get(ri.id) ?? []
			}
		}
	}

	scrubDeletedFrozenPreparations(row)
	return toWire<RecipeWithIngredients>(row, RECIPE_RELATIONS)
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

	// Dedup por família: mantém só a maior versão de cada família (versões inserem novas
	// linhas com base_recipe_id → raiz). Opera sobre as linhas Drizzle (camelCase) e
	// só converte para o contrato no final.
	const familyMap = new Map<string, (typeof rows)[number]>()
	for (const recipe of rows) {
		const rootId = recipe.baseRecipeId ?? recipe.id
		const existing = familyMap.get(rootId)
		if (!existing || recipe.version > existing.version) familyMap.set(rootId, recipe)
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
	}))
	// INSERT ... RETURNING devolve as linhas na ordem de inserção, permitindo ligar cada
	// alternativa ao recipe_ingredient recém-criado pelo índice.
	const inserted = await runQuery("INSERT_INGREDIENTS_FAILED", () =>
		db.insert(recipeIngredientsInKitchen).values(rows).returning({
			id: recipeIngredientsInKitchen.id,
			ingredientId: recipeIngredientsInKitchen.ingredientId,
			priorityOrder: recipeIngredientsInKitchen.priorityOrder,
		})
	)
	if (inserted.length !== rows.length) throw new DomainError("INSERT_INGREDIENTS_FAILED", "row count mismatch")

	const altRows = inserted.flatMap((row, i) =>
		(ingredients[i].alternatives ?? []).map((alt) => ({
			recipeIngredientId: row.id,
			ingredientId: alt.ingredientId,
			netQuantity: String(alt.netQuantity),
			priorityOrder: alt.priorityOrder,
		}))
	)
	if (altRows.length) {
		await runQuery("INSERT_ALTERNATIVES_FAILED", () =>
			db
				.insert(recipeIngredientAlternativesInKitchen)
				.values(altRows)
				.then(() => undefined)
		)
	}
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
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

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
 */
async function authorizeRecipeMutation(db: SisubDb, ctx: UserContext, recipeId: string): Promise<void> {
	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(recipesInKitchen.id, recipeId) })
	)
	if (!recipe) throw new NotFoundError("recipe", recipeId)

	if (recipe.kitchenId == null) {
		requirePermission(ctx, "global", 2)
	} else {
		requireKitchen(ctx, 2, recipe.kitchenId)
	}
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

export async function createRecipeVersion(db: SisubDb, ctx: UserContext, input: CreateRecipeVersion): Promise<Recipe> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

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
				baseRecipeId: input.baseRecipeId,
				version: input.version,
			})
			.returning()
	)

	const inserted = await insertIngredients(db, recipe.id, input.ingredients)

	// Copy-forward do fluxo de produção: se a edição veio de uma versão com fluxo,
	// copia o grafo para a nova versão remapeando os insumos. Não-atômico com o
	// insert da versão (paridade com o comportamento atual); falha aqui não desfaz
	// a versão já criada — o fluxo pode ser re-salvo manualmente.
	if (input.sourceRecipeId) {
		const riIdMap = await buildIngredientIdMap(db, input.sourceRecipeId, inserted)
		await copyRecipeFlow(db, input.sourceRecipeId, recipe.id, riIdMap)
	}

	return toWire<Recipe>(recipe, RECIPE_RELATIONS)
}
