/**
 * Global module tools — recipes, ingredients, templates, permissions management.
 * Ported from server functions: recipes.fn.ts, ingredients.fn.ts, templates.fn.ts
 */

import {
	fetchIngredient as fetchIngredientOp,
	listIngredientItems as listIngredientItemsOp,
	listIngredientNutrients as listIngredientNutrientsOp,
	listIngredients as listIngredientsOp,
} from "@iefa/sisub-domain"
import type { ModuleToolDefinition } from "./shared"
import { clampLimit, domainCtx, requireGlobalPermission, requireUuid, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

/**
 * Listagens do chat andam com teto e sem detalhe aninhado. O catálogo global tem
 * ~2.000 receitas e ~1.900 insumos: devolver tudo (ainda por cima com os
 * ingredientes embutidos) passava de 10 MB e o provider recusava o turno
 * seguinte com 413 — a conversa morria numa bolha vazia.
 */
const RECIPE_LIST_COLUMNS = "id, name, version, portion_yield, preparation_time_minutes, folder_id" as const

const LIST_DEFAULT = 30
const LIST_MAX = 100

/**
 * Insumo/preparação na listagem: identificação e unidade, sem nutrientes nem SKUs.
 * As operations devolvem em snake_case (contrato preservado por `toWire`).
 */
function slimIngredient(row: { id: string; description: string | null; measure_unit?: string | null; folder_id?: string | null }) {
	return { id: row.id, description: row.description, measure_unit: row.measure_unit ?? null, folder_id: row.folder_id ?? null }
}

const listRecipes: ModuleToolDefinition = {
	name: "list_recipes",
	description:
		"Lista receitas globais (padrão SDAB), só com os campos de identificação. Suporta busca por nome. Para ingredientes e modo de preparo, chame get_recipe com o id da receita.",
	parameters: {
		type: "object",
		properties: {
			search: { type: "string", description: "Busca por nome (parcial, case-insensitive)" },
			limit: { type: "number", description: `Quantas receitas retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)
		let query = ctx.supabase
			.from("recipes")
			.select(RECIPE_LIST_COLUMNS, { count: "exact" })
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("name")
			.limit(limit)

		if (args.search) {
			query = query.ilike("name", `%${String(args.search).slice(0, 200)}%`)
		}

		const { data, error, count } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_recipes"))
		return toolOk({ recipes: data ?? [], returned: data?.length ?? 0, total: count ?? data?.length ?? 0, limit })
	},
}

const getRecipe: ModuleToolDefinition = {
	name: "get_recipe",
	description: "Retorna detalhes de uma receita com ingredientes completos.",
	parameters: {
		type: "object",
		properties: { recipeId: { type: "string", description: "ID (UUID) da receita" } },
		required: ["recipeId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const recipeId = requireUuid(args.recipeId, "recipeId")

		const { data, error } = await ctx.supabase
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, ingredient:ingredient_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (error) return toolErr(sanitizeDbError(error, "get_recipe"))
		return toolOk(data)
	},
}

/**
 * Insumos e preparações passam pelas operations do domínio, não por PostgREST cru.
 *
 * A versão anterior montava a query na mão e errava em três pontos ao mesmo tempo,
 * todos fatais em runtime: ordenava e buscava por uma coluna `name` que
 * `kitchen.ingredient` não tem (a coluna é `description`), convertia `folder_id`
 * — um `uuid` — com `Number()`, e embutia `ingredient_nutrients`/`ingredient_items`
 * no plural quando as tabelas são singulares. Nada disso o typecheck via, porque
 * `untypedFrom` devolve `any` de propósito.
 *
 * Delegar também faz a tool herdar o escopo do catálogo: `list_ingredients` para de
 * devolver, misturadas, as preparações herdadas do SISUBWEB.
 */
const listIngredients: ModuleToolDefinition = {
	name: "list_ingredients",
	description:
		"Lista insumos do catálogo global. Suporta busca por descrição. Não inclui as preparações herdadas do SISUBWEB — para essas, use list_preparations.",
	parameters: {
		type: "object",
		properties: {
			search: { type: "string", description: "Busca parcial na descrição, sem distinguir caixa" },
			folderId: { type: "string", description: "ID (UUID) da pasta/categoria (opcional)" },
			limit: { type: "number", description: `Quantos insumos retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const search = args.search != null ? String(args.search).slice(0, 200) : undefined
		const folderId = args.folderId != null ? requireUuid(args.folderId, "folderId") : undefined
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)
		const rows = await listIngredientsOp(ctx.db, domainCtx(ctx), { search, folderId })
		return toolOk({ ingredients: rows.slice(0, limit).map(slimIngredient), returned: Math.min(rows.length, limit), total: rows.length, limit })
	},
}

const listPreparations: ModuleToolDefinition = {
	name: "list_preparations",
	description: "Lista as preparações herdadas do SISUBWEB. Elas moram na mesma tabela dos insumos mas não são insumos — os nomes colidem com os das receitas.",
	parameters: {
		type: "object",
		properties: {
			search: { type: "string", description: "Busca parcial na descrição, sem distinguir caixa" },
			limit: { type: "number", description: `Quantas preparações retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const search = args.search != null ? String(args.search).slice(0, 200) : undefined
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)
		const rows = await listIngredientsOp(ctx.db, domainCtx(ctx), { search, preparations: "only" })
		return toolOk({ preparations: rows.slice(0, limit).map(slimIngredient), returned: Math.min(rows.length, limit), total: rows.length, limit })
	},
}

const getIngredient: ModuleToolDefinition = {
	name: "get_ingredient",
	description: "Retorna detalhes de um insumo com nutrientes e itens de produto (SKUs). Funciona também para uma preparação do SISUBWEB, buscando pelo ID.",
	parameters: {
		type: "object",
		properties: { ingredientId: { type: "string", description: "ID (UUID) do insumo" } },
		required: ["ingredientId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const ingredientId = requireUuid(args.ingredientId, "ingredientId")
		const db = ctx.db
		const dctx = domainCtx(ctx)
		// `fetchIngredient` lança NotFoundError; wrapTool converte em erro de tool.
		const [ingredient, nutrients, items] = await Promise.all([
			fetchIngredientOp(db, dctx, { id: ingredientId }),
			listIngredientNutrientsOp(db, dctx, { ingredientId }),
			listIngredientItemsOp(db, dctx, { ingredientId }),
		])
		return toolOk({ ...ingredient, nutrients, items })
	},
}

const listMenuTemplates: ModuleToolDefinition = {
	name: "list_menu_templates",
	description: "Lista templates semanais globais (SDAB) com contagem de itens.",
	parameters: {
		type: "object",
		properties: {
			limit: { type: "number", description: `Quantos templates retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		const { data, error } = await ctx.supabase
			.from("menu_template")
			.select(`*, items:menu_template_items(count)`, { count: "exact" })
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("name")
			.limit(limit)

		if (error) return toolErr(sanitizeDbError(error, "list_menu_templates"))

		const templates = (data ?? []).map((t) => ({
			...t,
			item_count: Array.isArray(t.items) ? ((t.items[0] as { count: number } | undefined)?.count ?? 0) : 0,
		}))

		return toolOk(templates)
	},
}

const createRecipe: ModuleToolDefinition = {
	name: "create_recipe",
	description: "Cria uma nova receita global. Requer permissão de escrita.",
	parameters: {
		type: "object",
		properties: {
			name: { type: "string", description: "Nome da receita" },
			preparationTime: { type: "number", description: "Tempo de preparo em minutos (opcional)" },
			cookingFactor: { type: "number", description: "Fator de cocção (opcional, ex: 0.85)" },
		},
		required: ["name"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 2)

		if (typeof args.name !== "string" || !args.name.trim()) return toolErr("Nome é obrigatório")

		const insert: Record<string, unknown> = {
			name: String(args.name).trim(),
			kitchen_id: null,
		}
		if (args.preparationTime != null) insert.preparation_time = Number(args.preparationTime)
		if (args.cookingFactor != null) insert.cooking_factor = Number(args.cookingFactor)

		const { data, error } = await untypedFrom(ctx, "recipes").insert(insert).select().single()
		if (error) return toolErr(sanitizeDbError(error, "create_recipe"))
		return toolOk(data)
	},
}

const updateRecipe: ModuleToolDefinition = {
	name: "update_recipe",
	description: "Atualiza uma receita global existente.",
	parameters: {
		type: "object",
		properties: {
			recipeId: { type: "string", description: "ID (UUID) da receita" },
			name: { type: "string", description: "Novo nome (opcional)" },
			preparationTime: { type: "number", description: "Tempo de preparo em minutos (opcional)" },
			cookingFactor: { type: "number", description: "Fator de cocção (opcional)" },
		},
		required: ["recipeId"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 2)
		const recipeId = requireUuid(args.recipeId, "recipeId")

		const update: Record<string, unknown> = {}
		if (args.name != null) update.name = String(args.name).trim()
		if (args.preparationTime != null) update.preparation_time = Number(args.preparationTime)
		if (args.cookingFactor != null) update.cooking_factor = Number(args.cookingFactor)

		if (Object.keys(update).length === 0) return toolErr("Nenhum campo para atualizar")

		const { data, error } = await untypedFrom(ctx, "recipes").update(update).eq("id", recipeId).is("kitchen_id", null).select().single()
		if (error) return toolErr(sanitizeDbError(error, "update_recipe"))
		return toolOk(data)
	},
}

export const globalTools: ModuleToolDefinition[] = [
	listRecipes,
	getRecipe,
	listIngredients,
	listPreparations,
	getIngredient,
	listMenuTemplates,
	createRecipe,
	updateRecipe,
]
