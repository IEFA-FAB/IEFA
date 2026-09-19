/**
 * Tools MCP — Módulo Cozinhas (referência)
 * Thin wrapper delegating to @iefa/sisub-domain operations.
 *
 * list_kitchens está em planning.ts (contexto de planejamento).
 * Aqui fica list_unit_kitchens: lista cozinhas filtradas por unidade.
 */

import { ListUnitKitchensSchema, listAccessibleKitchens, toJsonSchema } from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDb } from "../db.ts"
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
			"Lista as cozinhas (id + display_name) de uma unidade específica em que o usuário tem acesso (planejamento ou produção), ordenadas por nome. Use quando precisar filtrar cozinhas por unidade militar. Requer permissão kitchen ou kitchen-production nível 1.",
		inputSchema: toJsonSchema(ListUnitKitchensSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListUnitKitchensSchema.parse(args)
			// Mesmo recorte de `list_kitchens`: só as cozinhas em que a credencial trabalha.
			// `listUnitKitchens` é referência de seletor e descarta o contexto — exposto aqui,
			// bastava varrer `unitId` para remontar a lista da FAB inteira que `list_kitchens`
			// deixou de entregar.
			const kitchens = await listAccessibleKitchens(getDb(), ctx)
			return toolResult(
				kitchens
					.filter((kitchen) => kitchen.unit_id === input.unitId)
					.map((kitchen) => ({ id: kitchen.id, display_name: kitchen.display_name }))
					.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "pt-BR"))
			)
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const kitchenTools: ToolDefinition[] = [listUnitKitchensTool]
