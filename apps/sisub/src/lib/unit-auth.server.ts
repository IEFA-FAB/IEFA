/**
 * @module unit-auth.server
 * Guard PBAC `unit` ESCOPADO por unidade — irmão do `requireStorageForKitchen`.
 *
 * O review do épico de estoque mostrou que guard sem escopo aceita a permissão
 * de uma unidade para dados de outra (a service role não tem RLS para segurar
 * isso). Execução orçamentária é dado sensível: escopo é obrigatório.
 */

import type { UserContext } from "@iefa/sisub-domain/types"
import { requireAuthWithPermission } from "@/lib/auth.server"

export async function requireUnitScope(level: 1 | 2 | 3, unitId: number | null | undefined): Promise<UserContext> {
	if (unitId != null) return requireAuthWithPermission("unit", level, { type: "unit", id: unitId })
	// Sem unidade resolvível: só permissão GLOBAL passa — permissão escopada em
	// outra unidade não pode alcançar dados sem escopo.
	const ctx = await requireAuthWithPermission("unit", level)
	const isGlobal = ctx.permissions.some(
		(p) => p.module === "unit" && p.level >= level && p.unit_id === null && p.kitchen_id === null && p.mess_hall_id === null
	)
	if (!isGlobal) throw new Error("Requer permissão global de unidade para dados sem unidade atribuída")
	return ctx
}
