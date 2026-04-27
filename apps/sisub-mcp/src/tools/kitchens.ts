/**
 * Tools MCP — Módulo Cozinhas (referência)
 * Thin wrapper delegating to @iefa/sisub-domain operations.
 *
 * list_kitchens está em planning.ts (contexto de planejamento).
 * Aqui fica list_unit_kitchens: lista cozinhas filtradas por unidade.
 */

import { ListUnitKitchensSchema, listUnitKitchens, toJsonSchema } from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_unit_kitchens
// ---------------------------------------------------------------------------

const listUnitKitchensTool: ToolDefinition = {
	schema: {
		name: "list_unit_kitchens",
		description:
			"Lista as cozinhas (id + display_name) de uma unidade específica, ordenadas por nome. Use quando precisar filtrar cozinhas por unidade militar. Requer permissão kitchen nível 1.",
		inputSchema: toJsonSchema(ListUnitKitchensSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListUnitKitchensSchema.parse(args)
			return toolResult(await listUnitKitchens(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const kitchenTools: ToolDefinition[] = [listUnitKitchensTool]
