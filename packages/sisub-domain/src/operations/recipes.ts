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
	menuTemplateInSisub,
	menuTemplateItemsInSisub,
	recipeIngredientAlternativesInSisub,
	recipeIngredientsInSisub,
	recipesInSisub,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Ingredient, Recipe, RecipeIngredient, RecipeIngredientAlternative } from "@iefa/database/sisub"
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

// ── Wire contract (snake_case aninhado, idêntico ao que o PostgREST devolvia) ──

type RecipeIngredientWire = RecipeIngredient & {
	ingredient: Ingredient | null
	alternatives?: (RecipeIngredientAlternative & { ingredient: Ingredient | null })[]
}
type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredientWire[] }

/**
 * Relations da query relacional do Drizzle nomeadas de forma "feia" pelo `drizzle-kit pull`.
 * Passadas a `toWire()` para renomear às chaves do contrato (o resto vira snake_case).
 */
const RECIPE_RELATIONS: Record<string, string> = {
	recipeIngredientsInSisubs: "ingredients",
	recipeIngredientAlternativesInSisubs: "alternatives",
	ingredientInSisub: "ingredient",
}

// Relational `with` — nível ingredientes (com o insumo de cada um).
const WITH_INGREDIENTS = { recipeIngredientsInSisubs: { with: { ingredientInSisub: true } } } as const

export async function fetchRecipe(db: SisubDb, ctx: UserContext, input: FetchRecipe): Promise<RecipeWithIngredients> {
	requirePermission(ctx, "kitchen", 1)

	// BUG FIX: filtra deleted_at IS NULL — sisub não filtrava.
	const where = and(eq(recipesInSisub.id, input.recipeId), isNull(recipesInSisub.deletedAt))
	const row = await runQuery("FETCH_FAILED", () => db.query.recipesInSisub.findFirst({ where, with: WITH_INGREDIENTS }))

	if (!row) throw new NotFoundError("recipe", input.recipeId)

	// Alternativas em query SEPARADA — NÃO aninhar no relational query acima.
	// recipe → recipe_ingredients → alternatives → ingredient é fundo demais: o Drizzle
	// concatena o caminho das relations no alias da tabela e o nome estoura o limite de
	// 63 chars de identificador do Postgres (NAMEDATALEN), que trunca silenciosamente →
	// aliases divergem/colidem e a query inteira quebra (detalhe da preparação nunca carrega).
	// Buscamos as alternativas dos recipe_ingredients desta receita (profundidade 2, dentro
	// do limite) e costuramos no shape que o toWire/contrato espera.
	if (input.includeAlternatives) {
		const ingredientRows = row.recipeIngredientsInSisubs ?? []
		const riIds = ingredientRows.map((ri) => ri.id)
		if (riIds.length > 0) {
			const alts = await runQuery("FETCH_FAILED", () =>
				db.query.recipeIngredientAlternativesInSisub.findMany({
					where: inArray(recipeIngredientAlternativesInSisub.recipeIngredientId, riIds),
					with: { ingredientInSisub: true },
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
				;(ri as Record<string, unknown>).recipeIngredientAlternativesInSisubs = byRecipeIngredient.get(ri.id) ?? []
			}
		}
	}

	return toWire<RecipeWithIngredients>(row, RECIPE_RELATIONS)
}

export async function listRecipes(db: SisubDb, ctx: UserContext, input: ListRecipes): Promise<RecipeWithIngredients[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const conditions: (SQL | undefined)[] = []
	if (!input.includeDeleted) conditions.push(isNull(recipesInSisub.deletedAt))
	if (input.kitchenId != null && !input.globalOnly) {
		conditions.push(or(isNull(recipesInSisub.kitchenId), eq(recipesInSisub.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(recipesInSisub.kitchenId))
	}
	if (input.search) conditions.push(ilike(recipesInSisub.name, `%${input.search}%`))

	// Sem orderBy no SQL: o sort pt-BR em JS (após o dedup) determina a ordem final;
	// ordenar no Postgres seria um passo sem efeito observável.
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInSisub.findMany({
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
		.map((r) => toWire<RecipeWithIngredients>(r, RECIPE_RELATIONS))
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
			.select({ recipeId: menuTemplateItemsInSisub.recipeId })
			.from(menuTemplateItemsInSisub)
			.innerJoin(menuTemplateInSisub, eq(menuTemplateItemsInSisub.menuTemplateId, menuTemplateInSisub.id))
			.where(and(eq(menuTemplateInSisub.templateType, "weekly"), isNull(menuTemplateInSisub.deletedAt), isNotNull(menuTemplateItemsInSisub.recipeId)))
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
		db.query.recipesInSisub.findFirst({ columns: { id: true, baseRecipeId: true }, where: eq(recipesInSisub.id, input.recipeId) })
	)
	if (!root) throw new NotFoundError("recipe", input.recipeId)

	const rootId = root.baseRecipeId ?? root.id

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInSisub.findMany({
			where: or(eq(recipesInSisub.id, rootId), eq(recipesInSisub.baseRecipeId, rootId)),
			with: WITH_INGREDIENTS,
			orderBy: (recipe, { asc }) => [asc(recipe.version)],
		})
	)

	return rows.map((r) => toWire<RecipeWithIngredients>(r, RECIPE_RELATIONS))
}

async function insertIngredients(db: SisubDb, recipeId: string, ingredients: CreateRecipe["ingredients"]) {
	if (!ingredients?.length) return

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
		db.insert(recipeIngredientsInSisub).values(rows).returning({ id: recipeIngredientsInSisub.id })
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
				.insert(recipeIngredientAlternativesInSisub)
				.values(altRows)
				.then(() => undefined)
		)
	}
}

export async function createRecipe(db: SisubDb, ctx: UserContext, input: CreateRecipe): Promise<Recipe> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const recipe = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(recipesInSisub)
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
		db.query.recipesInSisub.findFirst({ columns: { kitchenId: true }, where: eq(recipesInSisub.id, recipeId) })
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
			.update(recipesInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(recipesInSisub.id, input.id))
			.then(() => undefined)
	)
}

/** Restaura uma receita previamente excluída (deleted_at = null). */
export async function restoreRecipe(db: SisubDb, ctx: UserContext, input: RestoreRecipe): Promise<void> {
	await authorizeRecipeMutation(db, ctx, input.id)
	await runQuery("RESTORE_FAILED", () =>
		db
			.update(recipesInSisub)
			.set({ deletedAt: null })
			.where(eq(recipesInSisub.id, input.id))
			.then(() => undefined)
	)
}

/** Renomeia uma receita in-place (não cria versão). Usado por localizar e substituir. */
export async function renameRecipe(db: SisubDb, ctx: UserContext, input: RenameRecipe): Promise<void> {
	await authorizeRecipeMutation(db, ctx, input.id)
	await runQuery("UPDATE_FAILED", () =>
		db
			.update(recipesInSisub)
			.set({ name: input.name })
			.where(eq(recipesInSisub.id, input.id))
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
			.insert(recipesInSisub)
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

	await insertIngredients(db, recipe.id, input.ingredients)
	return toWire<Recipe>(recipe, RECIPE_RELATIONS)
}
