/**
 * Global module tools — recipes, products, templates, permissions management.
 * Ported from server functions: recipes.fn.ts, products.fn.ts, templates.fn.ts
 */

import type { ModuleToolDefinition } from "./shared"
import { requireGlobalPermission, requireUuid, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

const listRecipes: ModuleToolDefinition = {
	name: "list_recipes",
	description: "Lista receitas globais (padrão SDAB). Suporta busca por nome.",
	parameters: {
		type: "object",
		properties: {
			search: { type: "string", description: "Busca por nome (parcial, case-insensitive)" },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		let query = ctx.supabase
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`)
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("name")

		if (args.search) {
			query = query.ilike("name", `%${String(args.search).slice(0, 200)}%`)
		}

		const { data, error } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_recipes"))
		return toolOk(data ?? [])
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
			.select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (error) return toolErr(sanitizeDbError(error, "get_recipe"))
		return toolOk(data)
	},
}

const listProducts: ModuleToolDefinition = {
	name: "list_products",
	description: "Lista produtos do catálogo com nutrientes e código CATMAT. Suporta busca por nome.",
	parameters: {
		type: "object",
		properties: {
			search: { type: "string", description: "Busca por nome (parcial, case-insensitive)" },
			folderId: { type: "number", description: "ID da pasta/categoria (opcional)" },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		let query = untypedFrom(ctx, "products").select(`*, folder:folder_id(*)`).is("deleted_at", null).order("name")

		if (args.search) {
			query = query.ilike("name", `%${String(args.search).slice(0, 200)}%`)
		}
		if (args.folderId != null) {
			query = query.eq("folder_id", Number(args.folderId))
		}

		const { data, error } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_products"))
		return toolOk(data ?? [])
	},
}

const getProduct: ModuleToolDefinition = {
	name: "get_product",
	description: "Retorna detalhes de um produto com nutrientes e itens (SKUs).",
	parameters: {
		type: "object",
		properties: { productId: { type: "string", description: "ID (UUID) do produto" } },
		required: ["productId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const productId = requireUuid(args.productId, "productId")

		const { data, error } = await untypedFrom(ctx, "products")
			.select(`*, nutrients:product_nutrients(*), items:product_items(*)`)
			.eq("id", productId)
			.is("deleted_at", null)
			.single()

		if (error) return toolErr(sanitizeDbError(error, "get_product"))
		return toolOk(data)
	},
}

const listMenuTemplates: ModuleToolDefinition = {
	name: "list_menu_templates",
	description: "Lista templates semanais globais (SDAB) com contagem de itens.",
	parameters: { type: "object", properties: {}, required: [] },
	requiredLevel: 1,
	async handler(_args, ctx) {
		requireGlobalPermission(ctx, 1)

		const { data, error } = await ctx.supabase
			.from("menu_template")
			.select(`*, items:menu_template_items(count)`, { count: "exact" })
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("name")

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

export const globalTools: ModuleToolDefinition[] = [listRecipes, getRecipe, listProducts, getProduct, listMenuTemplates, createRecipe, updateRecipe]
