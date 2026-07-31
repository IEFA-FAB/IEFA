/**
 * Tools MCP — Módulo Receitas
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
	CreateRecipeSchema,
	SaveRecipeEditSchema,
	createRecipe,
	saveRecipeEdit,
	FetchRecipeSchema,
	fetchRecipe,
	ListRecipeVersionsSchema,
	listRecipeVersions,
	toJsonSchema,
} from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDb } from "../db.ts"
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
			return toolResult(await fetchRecipe(getDb(), ctx, input))
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
			return toolResult(await listRecipeVersions(getDb(), ctx, input))
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
			return toolResult(await createRecipe(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_recipe_version
// ---------------------------------------------------------------------------

const saveRecipeEditTool: ToolDefinition = {
	schema: {
		name: "save_recipe_edit",
		description:
			"Salva a edição de uma receita existente. Exige `context`: com {scope:'kitchen',kitchenId} a edição de uma receita GLOBAL não a altera — cria uma cópia local daquela cozinha (fork copy-on-write, git-like), exigindo kitchen nível 2 ali. Com {scope:'global'} cria nova versão global, exigindo global nível 2. A versão e o escopo são calculados no servidor.",
		inputSchema: toJsonSchema(SaveRecipeEditSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = SaveRecipeEditSchema.parse(args)
			return toolResult(await saveRecipeEdit(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const recipeTools: ToolDefinition[] = [getRecipe, listRecipeVersionsTool, createRecipeTool, saveRecipeEditTool]
