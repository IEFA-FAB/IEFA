/**
 * Tools MCP — Módulo Receitas
 *
 * Segurança:
 *   H3 — safeInt() antes de interpolações em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 *
 * DRY:
 *   RECIPE_SELECT_WITH_INGREDIENTS / RECIPE_SELECT_WITH_ALTERNATIVES — selects reutilizados.
 *   insertRecipeIngredients() — inserção de ingredientes compartilhada por
 *     create_recipe e create_recipe_version.
 */

import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, safeInt, safePositiveNumber, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// Selects reutilizados
// ---------------------------------------------------------------------------

const RECIPE_SELECT_WITH_INGREDIENTS = `
  *,
  ingredients:recipe_ingredients(
    *,
    product:product_id(*)
  )
` as const

const RECIPE_SELECT_WITH_ALTERNATIVES = `
  *,
  ingredients:recipe_ingredients(
    *,
    product:product_id(*),
    alternatives:recipe_ingredient_alternatives(
      *,
      product:product_id(*)
    )
  )
` as const

// ---------------------------------------------------------------------------
// Helper privado: inserção de ingredientes
// ---------------------------------------------------------------------------

type IngredientInput = {
	productId: string
	netQuantity: number
	isOptional: boolean
	priorityOrder: number
}

/**
 * Insere ingredientes para uma receita. Compartilhado por create_recipe e create_recipe_version.
 * Retorna string de erro sanitizada ou null em caso de sucesso.
 */
async function insertRecipeIngredients(db: ReturnType<typeof getDataClient>, recipeId: string, ingredients: IngredientInput[]): Promise<string | null> {
	if (ingredients.length === 0) return null

	const rows = ingredients.map((ing) => ({
		recipe_id: recipeId,
		product_id: String(ing.productId),
		net_quantity: safePositiveNumber(ing.netQuantity, "netQuantity"),
		is_optional: Boolean(ing.isOptional),
		priority_order: safeInt(ing.priorityOrder, "priorityOrder"),
	}))

	const { error } = await db.from("recipe_ingredients").insert(rows)
	if (error) return sanitizeDbError(error, "insert_recipe_ingredients")
	return null
}

// ---------------------------------------------------------------------------
// Schema de ingrediente (compartilhado entre create_recipe e create_recipe_version)
// ---------------------------------------------------------------------------

const ingredientItemSchema = {
	type: "object",
	properties: {
		productId: { type: "string", description: "ID (UUID) do produto" },
		netQuantity: { type: "number", description: "Quantidade líquida por porção" },
		isOptional: { type: "boolean", description: "true = ingrediente opcional" },
		priorityOrder: { type: "number", description: "Ordem de exibição/prioridade" },
	},
	required: ["productId", "netQuantity", "isOptional", "priorityOrder"],
}

const recipeMetaProperties = {
	name: { type: "string", description: "Nome da receita" },
	preparationMethod: { type: "string", description: "Modo de preparo (opcional)" },
	portionYield: { type: "number", description: "Número de porções rendidas" },
	preparationTimeMinutes: { type: "number", description: "Tempo de preparo em minutos (opcional)" },
	cookingFactor: { type: "number", description: "Fator de cocção (opcional)" },
	rationalId: { type: "string", description: "ID no Rational (equipamento, opcional)" },
	kitchenId: { type: "number", description: "ID da cozinha. null = receita global" },
	ingredients: {
		type: "array",
		description: "Ingredientes da receita (opcional)",
		items: ingredientItemSchema,
	},
}

// ---------------------------------------------------------------------------
// get_recipe
// ---------------------------------------------------------------------------

const getRecipe: ToolDefinition = {
	schema: {
		name: "get_recipe",
		description:
			"Retorna o detalhe completo de uma receita por ID, incluindo ingredientes. Com includeAlternatives=true, retorna também as alternativas de cada ingrediente. A receita deve pertencer à cozinha do usuário ou ser global.",
		inputSchema: {
			type: "object",
			properties: {
				recipeId: { type: "string", description: "ID (UUID) da receita" },
				includeAlternatives: {
					type: "boolean",
					description: "Se true, retorna alternativas de cada ingrediente (default: false)",
				},
			},
			required: ["recipeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 1)

		if (typeof args.recipeId !== "string" || !args.recipeId.trim()) {
			return toolError("recipeId é obrigatório e deve ser uma string (UUID)")
		}

		const recipeId = String(args.recipeId).trim()
		const db = getDataClient()
		const select = args.includeAlternatives ? RECIPE_SELECT_WITH_ALTERNATIVES : RECIPE_SELECT_WITH_INGREDIENTS

		const { data, error } = await db.from("recipes").select(select).eq("id", recipeId).is("deleted_at", null).single()

		if (error || !data) return toolError("Receita não encontrada")
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// list_recipe_versions
// ---------------------------------------------------------------------------

const listRecipeVersions: ToolDefinition = {
	schema: {
		name: "list_recipe_versions",
		description:
			"Retorna todas as versões de uma família de receitas (raiz + branches), ordenadas por versão crescente. Funciona com o ID de qualquer versão da família.",
		inputSchema: {
			type: "object",
			properties: {
				recipeId: { type: "string", description: "ID (UUID) de qualquer versão da família de receitas" },
			},
			required: ["recipeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 1)

		if (typeof args.recipeId !== "string" || !args.recipeId.trim()) {
			return toolError("recipeId é obrigatório e deve ser uma string (UUID)")
		}

		const recipeId = String(args.recipeId).trim()
		const db = getDataClient()

		// Buscar a receita para descobrir o ID raiz
		const { data: recipe, error: recipeError } = await db.from("recipes").select("id, base_recipe_id").eq("id", recipeId).single()

		if (recipeError || !recipe) return toolError("Receita não encontrada")

		// Se tem base_recipe_id, usa como raiz; caso contrário, a própria é a raiz
		const rootId = recipe.base_recipe_id ?? recipe.id

		const { data: versions, error } = await db
			.from("recipes")
			.select(RECIPE_SELECT_WITH_INGREDIENTS)
			.or(`id.eq.${rootId},base_recipe_id.eq.${rootId}`)
			.order("version", { ascending: true })

		if (error) return toolError(sanitizeDbError(error, "list_recipe_versions"))
		return toolResult(versions ?? [])
	},
}

// ---------------------------------------------------------------------------
// create_recipe
// ---------------------------------------------------------------------------

const createRecipe: ToolDefinition = {
	schema: {
		name: "create_recipe",
		description:
			"Cria uma nova receita com version=1 e opcionalmente seus ingredientes. kitchenId=null cria uma receita global. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: recipeMetaProperties,
			required: ["name", "portionYield"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")
		if (args.portionYield == null) return toolError("portionYield é obrigatório")

		const kitchenId = args.kitchenId != null ? safeInt(args.kitchenId, "kitchenId") : null // H3

		if (kitchenId !== null) {
			requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })
		} else {
			requireKitchenPermission(ctx, 2)
		}

		const db = getDataClient()

		const { data: recipe, error: recipeError } = await db
			.from("recipes")
			.insert({
				name: String(args.name).trim(),
				preparation_method: args.preparationMethod ? String(args.preparationMethod) : null,
				portion_yield: safePositiveNumber(args.portionYield, "portionYield"),
				preparation_time_minutes: args.preparationTimeMinutes != null ? safeInt(args.preparationTimeMinutes, "preparationTimeMinutes") : null,
				cooking_factor: args.cookingFactor != null ? safePositiveNumber(args.cookingFactor, "cookingFactor") : null,
				rational_id: args.rationalId ? String(args.rationalId) : null,
				kitchen_id: kitchenId,
				version: 1,
			})
			.select()
			.single()

		if (recipeError) return toolError(sanitizeDbError(recipeError, "create_recipe:insert"))

		const ingredients: IngredientInput[] = Array.isArray(args.ingredients) ? args.ingredients : []
		const ingErr = await insertRecipeIngredients(db, recipe.id, ingredients)
		if (ingErr) return toolError(ingErr)

		return toolResult(recipe)
	},
}

// ---------------------------------------------------------------------------
// create_recipe_version
// ---------------------------------------------------------------------------

const createRecipeVersion: ToolDefinition = {
	schema: {
		name: "create_recipe_version",
		description:
			"Cria uma nova versão de uma receita existente, vinculando base_recipe_id. Funciona como um branch git-like. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				...recipeMetaProperties,
				baseRecipeId: { type: "string", description: "ID (UUID) da receita raiz (base_recipe_id)" },
				newVersion: { type: "number", description: "Número da nova versão (ex: 2, 3, …)" },
			},
			required: ["name", "portionYield", "baseRecipeId", "newVersion"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")
		if (args.portionYield == null) return toolError("portionYield é obrigatório")
		if (typeof args.baseRecipeId !== "string" || !args.baseRecipeId.trim()) return toolError("baseRecipeId é obrigatório")
		if (args.newVersion == null) return toolError("newVersion é obrigatório")

		const kitchenId = args.kitchenId != null ? safeInt(args.kitchenId, "kitchenId") : null // H3

		if (kitchenId !== null) {
			requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })
		} else {
			requireKitchenPermission(ctx, 2)
		}

		const db = getDataClient()

		const { data: recipe, error: recipeError } = await db
			.from("recipes")
			.insert({
				name: String(args.name).trim(),
				preparation_method: args.preparationMethod ? String(args.preparationMethod) : null,
				portion_yield: safePositiveNumber(args.portionYield, "portionYield"),
				preparation_time_minutes: args.preparationTimeMinutes != null ? safeInt(args.preparationTimeMinutes, "preparationTimeMinutes") : null,
				cooking_factor: args.cookingFactor != null ? safePositiveNumber(args.cookingFactor, "cookingFactor") : null,
				rational_id: args.rationalId ? String(args.rationalId) : null,
				kitchen_id: kitchenId,
				base_recipe_id: String(args.baseRecipeId).trim(),
				version: safeInt(args.newVersion, "newVersion"),
			})
			.select()
			.single()

		if (recipeError) return toolError(sanitizeDbError(recipeError, "create_recipe_version:insert"))

		const ingredients: IngredientInput[] = Array.isArray(args.ingredients) ? args.ingredients : []
		const ingErr = await insertRecipeIngredients(db, recipe.id, ingredients)
		if (ingErr) return toolError(ingErr)

		return toolResult(recipe)
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const recipeTools: ToolDefinition[] = [getRecipe, listRecipeVersions, createRecipe, createRecipeVersion]
