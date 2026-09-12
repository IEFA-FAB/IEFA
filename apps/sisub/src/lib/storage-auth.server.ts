/**
 * @module storage-auth.server
 * Guard PBAC `storage` ESCOPADO por cozinha — fonte única para o módulo de
 * estoque (review Greptile: guards sem escopo aceitavam a permissão de uma
 * cozinha para dados de qualquer outra; a service role não tem RLS para
 * segurar isso).
 */

import { type AssuranceRequirement, NO_ASSURANCE } from "@iefa/pbac"
import type { UserContext } from "@iefa/sisub-domain/types"
import { requireAuthWithPermission } from "@/lib/auth.server"

export async function requireStorageForKitchen(
	level: 1 | 2 | 3,
	kitchenId: number | null | undefined,
	// Piso de garantia da operação, repassado ao guard. Default: nenhum — a etapa 9 do plano
	// é quem passa `enforcedAssuranceFor("<nomeDaFn>")` aqui.
	assurance: AssuranceRequirement = NO_ASSURANCE
): Promise<UserContext> {
	if (kitchenId != null) return requireAuthWithPermission("storage", level, { type: "kitchen", id: kitchenId }, assurance)
	// Sem cozinha resolvível: só permissão GLOBAL de storage passa — permissão
	// escopada em outra cozinha não pode alcançar dados sem escopo.
	const ctx = await requireAuthWithPermission("storage", level, undefined, assurance)
	const isGlobal = ctx.permissions.some(
		(p) => p.module === "storage" && p.level >= level && p.kitchen_id === null && p.unit_id === null && p.mess_hall_id === null
	)
	if (!isGlobal) throw new Error("Requer permissão global de estoque para dados sem cozinha atribuída")
	return ctx
}
