/**
 * Tools MCP — Módulo Cozinhas (referência)
 *
 * list_kitchens está em planning.ts (contexto de planejamento).
 * Aqui fica list_unit_kitchens: lista cozinhas filtradas por unidade.
 *
 * Segurança:
 *   H3 — safeInt() antes de interpolações em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 */

import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, safeInt, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_unit_kitchens
// ---------------------------------------------------------------------------

const listUnitKitchens: ToolDefinition = {
	schema: {
		name: "list_unit_kitchens",
		description:
			"Lista as cozinhas (id + display_name) de uma unidade específica, ordenadas por nome. Use quando precisar filtrar cozinhas por unidade militar. Requer permissão kitchen nível 1.",
		inputSchema: {
			type: "object",
			properties: {
				unitId: { type: "number", description: "ID da unidade militar" },
			},
			required: ["unitId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		requireKitchenPermission(ctx, 1)

		const unitId = safeInt(args.unitId, "unitId") // H3

		const db = getDataClient()
		const { data, error } = await db.from("kitchen").select("id, display_name").eq("unit_id", unitId).order("display_name")

		if (error) return toolError(sanitizeDbError(error, "list_unit_kitchens"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const kitchenTools: ToolDefinition[] = [listUnitKitchens]
