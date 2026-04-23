/**
 * Tools MCP — Módulo Tipos de Refeição (CRUD)
 *
 * Segurança:
 *   H3 — safeInt() antes de interpolações em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 *
 * Leitura (get_meal_types) está em planning.ts — aqui ficam apenas as
 * operações de escrita: create, update, delete, restore.
 */

import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, safeInt, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// create_meal_type
// ---------------------------------------------------------------------------

const createMealType: ToolDefinition = {
	schema: {
		name: "create_meal_type",
		description:
			"Cria um novo tipo de refeição. kitchenId=null cria um tipo global (SDAB); com kitchenId, cria um tipo local para aquela cozinha. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do tipo de refeição (ex: Desjejum, Almoço)" },
				sortOrder: { type: "number", description: "Ordem de exibição (menor = primeiro)" },
				kitchenId: { type: "number", description: "ID da cozinha. Omitido ou null = tipo global" },
			},
			required: ["name"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")

		const kitchenId = args.kitchenId != null ? safeInt(args.kitchenId, "kitchenId") : null // H3

		if (kitchenId !== null) {
			requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })
		} else {
			requireKitchenPermission(ctx, 2)
		}

		const db = getDataClient()

		const { data, error } = await db
			.from("meal_type")
			.insert({
				name: String(args.name).trim(),
				sort_order: args.sortOrder != null ? safeInt(args.sortOrder, "sortOrder") : null,
				kitchen_id: kitchenId,
			})
			.select()
			.single()

		if (error) return toolError(sanitizeDbError(error, "create_meal_type"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// update_meal_type
// ---------------------------------------------------------------------------

const updateMealType: ToolDefinition = {
	schema: {
		name: "update_meal_type",
		description: "Atualiza nome, sort_order ou kitchen_id de um tipo de refeição. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				mealTypeId: { type: "string", description: "ID (UUID) do tipo de refeição" },
				name: { type: "string", description: "Novo nome (opcional)" },
				sortOrder: { type: "number", description: "Nova ordem de exibição (opcional)" },
				kitchenId: { type: "number", description: "Nova cozinha associada, ou null para tornar global (opcional)" },
			},
			required: ["mealTypeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 2)

		if (typeof args.mealTypeId !== "string" || !args.mealTypeId.trim()) {
			return toolError("mealTypeId é obrigatório e deve ser uma string (UUID)")
		}

		const updates: Record<string, unknown> = {}
		if (args.name != null) updates.name = String(args.name).trim()
		if (args.sortOrder != null) updates.sort_order = safeInt(args.sortOrder, "sortOrder")
		if ("kitchenId" in args) updates.kitchen_id = args.kitchenId != null ? safeInt(args.kitchenId, "kitchenId") : null

		if (Object.keys(updates).length === 0) return toolError("Nenhuma atualização fornecida.")

		const db = getDataClient()
		const { data, error } = await db
			.from("meal_type")
			// biome-ignore lint/suspicious/noExplicitAny: dynamic update object — keys validated above
			.update(updates as any)
			.eq("id", String(args.mealTypeId).trim())
			.select()
			.single()

		if (error) return toolError(sanitizeDbError(error, "update_meal_type"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// delete_meal_type
// ---------------------------------------------------------------------------

const deleteMealType: ToolDefinition = {
	schema: {
		name: "delete_meal_type",
		description: "Soft-delete de um tipo de refeição (define deleted_at). Pode ser recuperado com restore_meal_type. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				mealTypeId: { type: "string", description: "ID (UUID) do tipo de refeição" },
			},
			required: ["mealTypeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 2)

		if (typeof args.mealTypeId !== "string" || !args.mealTypeId.trim()) {
			return toolError("mealTypeId é obrigatório e deve ser uma string (UUID)")
		}

		const db = getDataClient()
		const { error } = await db.from("meal_type").update({ deleted_at: new Date().toISOString() }).eq("id", String(args.mealTypeId).trim())

		if (error) return toolError(sanitizeDbError(error, "delete_meal_type"))
		return toolResult({ success: true, mealTypeId: args.mealTypeId, message: "Tipo de refeição removido (pode ser restaurado com restore_meal_type)" })
	},
}

// ---------------------------------------------------------------------------
// restore_meal_type
// ---------------------------------------------------------------------------

const restoreMealType: ToolDefinition = {
	schema: {
		name: "restore_meal_type",
		description: "Restaura um tipo de refeição soft-deleted, limpando deleted_at. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				mealTypeId: { type: "string", description: "ID (UUID) do tipo de refeição a restaurar" },
			},
			required: ["mealTypeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 2)

		if (typeof args.mealTypeId !== "string" || !args.mealTypeId.trim()) {
			return toolError("mealTypeId é obrigatório e deve ser uma string (UUID)")
		}

		const db = getDataClient()
		const { error } = await db.from("meal_type").update({ deleted_at: null }).eq("id", String(args.mealTypeId).trim())

		if (error) return toolError(sanitizeDbError(error, "restore_meal_type"))
		return toolResult({ success: true, mealTypeId: args.mealTypeId, message: "Tipo de refeição restaurado com sucesso" })
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const mealTypeTools: ToolDefinition[] = [createMealType, updateMealType, deleteMealType, restoreMealType]
