/**
 * Cozinha ↔ unidade: quem alcança uma cozinha pelo lado da OM, e se uma cozinha (ou um plano
 * de cardápio) pertence a uma OM.
 *
 * A ATA é da UNIDADE e o rascunho de ATA é da COZINHA; os dois se encontram no wizard, onde a
 * gestão da OM lê o rascunho que a cozinha enviou e compõe a ata com os planos das cozinhas.
 * Sem esta ponte as operações ou ficavam abertas (qualquer sessão lia o rascunho e os planos de
 * qualquer cozinha, e compunha ata de uma OM com cozinha e plano de outra) ou exigiriam
 * `kitchen:1` de quem gere a OM — trancando a gestão fora das próprias cozinhas.
 *
 * Unidade da cozinha = `unit_id` (a OM onde ela está) OU `purchase_unit_id` (a OM que compra por
 * ela). As duas legitimamente alcançam a cozinha; ver `resolvePurchaseUnitId`.
 */

import { kitchenInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import { eq } from "drizzle-orm"
import type { UserContext } from "../types/context.ts"
import { NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

export type KitchenUnitRef = { id: number; unitId: number | null; purchaseUnitId: number | null }

/** Unidades que respondem pela cozinha — a de lotação e a compradora, sem repetição. */
export function kitchenUnitIds(kitchen: KitchenUnitRef): number[] {
	return [...new Set([kitchen.unitId, kitchen.purchaseUnitId].filter((id): id is number => id != null))]
}

/** A cozinha pertence à OM (lotação ou compra)? */
export function kitchenBelongsToUnit(kitchen: KitchenUnitRef, unitId: number): boolean {
	return kitchenUnitIds(kitchen).includes(unitId)
}

/** `kitchen:<level>` escopado à cozinha OU `unit:<level>` escopado a uma OM dela. */
export function canReachKitchen(ctx: UserContext, level: 1 | 2, kitchen: KitchenUnitRef): boolean {
	if (hasPermission(ctx.permissions, "kitchen", level, { type: "kitchen", id: kitchen.id })) return true
	return kitchenUnitIds(kitchen).some((unitId) => hasPermission(ctx.permissions, "unit", level, { type: "unit", id: unitId }))
}

export async function loadKitchenUnitRef(db: SisubDb, kitchenId: number): Promise<KitchenUnitRef> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.kitchenInKitchen.findFirst({
			columns: { id: true, unitId: true, purchaseUnitId: true },
			where: eq(kitchenInKitchen.id, kitchenId),
		})
	)
	if (!row) throw new NotFoundError("kitchen", kitchenId)
	return row
}

/**
 * Leitura de dado de uma cozinha que a gestão da OM também precisa ver (rascunho de ATA
 * enviado pela cozinha). A OM sai da LINHA da cozinha, nunca da requisição.
 */
export async function requireKitchenOrItsUnit(db: SisubDb, ctx: UserContext, level: 1 | 2, kitchenId: number): Promise<void> {
	// Atalho sem ida ao banco: quem tem a própria cozinha não precisa da ponte.
	if (hasPermission(ctx.permissions, "kitchen", level, { type: "kitchen", id: kitchenId })) return
	const kitchen = await loadKitchenUnitRef(db, kitchenId)
	if (!canReachKitchen(ctx, level, kitchen)) throw new PermissionDeniedError("kitchen | unit", level, { type: "kitchen", id: kitchenId })
}
