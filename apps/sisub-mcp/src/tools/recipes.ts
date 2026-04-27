/**
 * Tools MCP — Módulo Receitas
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
	CreateRecipeSchema,
	CreateRecipeVersionSchema,
	createRecipe,
	createRecipeVersion,
	FetchRecipeSchema,
	fetchRecipe,
	ListRecipeVersionsSchema,
	listRecipeVersions,
	toJsonSchema,
} from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// get_recipe
// ---------------------------------------------------------------------------

const getRecipe: ToolDefinition = {
	schema: {
		name: "get_recipe",
		description:
			"Retorna o detalhe completo de uma receita por ID, incluindo ingredientes. Com includeAlternatives=true, retorna também as alternativas de cada ingrediente. A receita deve pertencer à cozinha do usuário ou ser global.",
		inputSchema: toJsonSchema(FetchRecipeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = FetchRecipeSchema.parse(args)
			return toolResult(await fetchRecipe(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// list_recipe_versions
// ---------------------------------------------------------------------------

const listRecipeVersionsTool: ToolDefinition = {
	schema: {
		name: "list_recipe_versions",
		description:
			"Retorna todas as versões de uma família de receitas (raiz + branches), ordenadas por versão crescente. Funciona com o ID de qualquer versão da família.",
		inputSchema: toJsonSchema(ListRecipeVersionsSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListRecipeVersionsSchema.parse(args)
			return toolResult(await listRecipeVersions(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_recipe
// ---------------------------------------------------------------------------

const createRecipeTool: ToolDefinition = {
	schema: {
		name: "create_recipe",
		description:
			"Cria uma nova receita com version=1 e opcionalmente seus ingredientes. kitchenId=null cria uma receita global. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(CreateRecipeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateRecipeSchema.parse(args)
			return toolResult(await createRecipe(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_recipe_version
// ---------------------------------------------------------------------------

const createRecipeVersionTool: ToolDefinition = {
	schema: {
		name: "create_recipe_version",
		description: "Cria uma nova versão de uma receita existente, vinculando baseRecipeId. Funciona como um branch git-like. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(CreateRecipeVersionSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateRecipeVersionSchema.parse(args)
			return toolResult(await createRecipeVersion(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const recipeTools: ToolDefinition[] = [getRecipe, listRecipeVersionsTool, createRecipeTool, createRecipeVersionTool]
