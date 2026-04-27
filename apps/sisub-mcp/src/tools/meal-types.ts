/**
 * Tools MCP — Módulo Tipos de Refeição (CRUD)
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 *
 * Leitura (get_meal_types) está em planning.ts — aqui ficam apenas as
 * operações de escrita: create, update, delete, restore.
 */

import {
	CreateMealTypeSchema,
	createMealType,
	DeleteMealTypeSchema,
	deleteMealType,
	RestoreMealTypeSchema,
	restoreMealType,
	toJsonSchema,
	UpdateMealTypeSchema,
	updateMealType,
} from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// create_meal_type
// ---------------------------------------------------------------------------

const createMealTypeTool: ToolDefinition = {
	schema: {
		name: "create_meal_type",
		description:
			"Cria um novo tipo de refeição. kitchenId=null cria um tipo global (SDAB); com kitchenId, cria um tipo local para aquela cozinha. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(CreateMealTypeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateMealTypeSchema.parse(args)
			return toolResult(await createMealType(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// update_meal_type
// ---------------------------------------------------------------------------

const updateMealTypeTool: ToolDefinition = {
	schema: {
		name: "update_meal_type",
		description: "Atualiza nome, sortOrder ou kitchenId de um tipo de refeição. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(UpdateMealTypeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpdateMealTypeSchema.parse(args)
			return toolResult(await updateMealType(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// delete_meal_type
// ---------------------------------------------------------------------------

const deleteMealTypeTool: ToolDefinition = {
	schema: {
		name: "delete_meal_type",
		description: "Soft-delete de um tipo de refeição (define deleted_at). Pode ser recuperado com restore_meal_type. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(DeleteMealTypeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DeleteMealTypeSchema.parse(args)
			await deleteMealType(getDataClient(), ctx, input)
			return toolResult({ success: true, mealTypeId: input.mealTypeId, message: "Tipo de refeição removido (pode ser restaurado com restore_meal_type)" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// restore_meal_type
// ---------------------------------------------------------------------------

const restoreMealTypeTool: ToolDefinition = {
	schema: {
		name: "restore_meal_type",
		description: "Restaura um tipo de refeição soft-deleted, limpando deleted_at. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(RestoreMealTypeSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = RestoreMealTypeSchema.parse(args)
			await restoreMealType(getDataClient(), ctx, input)
			return toolResult({ success: true, mealTypeId: input.mealTypeId, message: "Tipo de refeição restaurado com sucesso" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const mealTypeTools: ToolDefinition[] = [createMealTypeTool, updateMealTypeTool, deleteMealTypeTool, restoreMealTypeTool]
