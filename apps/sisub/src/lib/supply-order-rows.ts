/**
 * Linhas gravadas pela emissão da Ordem de Fornecimento e pelo vínculo posterior da NE
 * (`createSupplyOrderFn`, `linkSupplyOrderEmpenhoFn`). As regras do vínculo ficam em
 * `supply-order-gate.ts`; aqui, a montagem do que vai ao banco.
 *
 * Fora de `supply-order.fn.ts` porque teste unitário não pode importar `@/server/*`.
 */

import { resolvePurchaseUnitId } from "@iefa/sisub-domain/operations"

/** Unidade COMPRADORA da cozinha (`purchase_unit_id ?? unit_id`); cozinha não achada dá null. */
export function getKitchenPurchaseUnitId(kitchenRow: { unit_id: number | null; purchase_unit_id: number | null } | null | undefined): number | null {
	return resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null })
}

/** Itens de ARP citados pela OF, sem os vazios (com repetição: quem resolve deduplica). */
export function collectOrderArpItemIds(items: ReadonlyArray<{ arpItemId?: string }>): string[] {
	return items.map((item) => item.arpItemId).filter((id): id is string => Boolean(id))
}

export function buildSupplyOrderRow(input: {
	empenhoId: string | null | undefined
	kitchenId: number
	number: string | undefined
	sentAt: string
	expectedDelivery: string
	sicafStatus: string | null
	isSicafAcknowledged: boolean | undefined
	userId: string
}) {
	return {
		empenho_id: input.empenhoId ?? null,
		kitchen_id: input.kitchenId,
		number: input.number?.trim() || null,
		sent_at: input.sentAt,
		expected_delivery: input.expectedDelivery,
		status: "sent" as const,
		sicaf_status: input.sicafStatus,
		sicaf_ack_by: input.isSicafAcknowledged ? input.userId : null,
		created_by: input.userId,
	}
}

/**
 * Item da OF. O MRP conta como "em trânsito" só o item que tem purchase_item_id: o informado vence;
 * sem ele, o resolvido pelo CATMAT do item de ARP (ambíguo fica nulo).
 */
export function buildSupplyOrderItemRow(
	supplyOrderId: string,
	item: { arpItemId?: string; purchaseItemId?: string; orderedQty: number; unitPrice?: number },
	resolvedPurchaseItems: ReadonlyMap<string, string>
) {
	return {
		supply_order_id: supplyOrderId,
		arp_item_id: item.arpItemId ?? null,
		purchase_item_id: item.purchaseItemId ?? (item.arpItemId ? (resolvedPurchaseItems.get(item.arpItemId) ?? null) : null),
		ordered_qty: item.orderedQty,
		unit_price: item.unitPrice ?? null,
	}
}

/** O trigger do teto (valor vigente, empenho anulado, OF sem preço) já diz o que fazer. */
export function isSupplyOrderGateMessage(message: string): boolean {
	return /excede|anulado|preço/.test(message)
}

/** Fatos do empenho para `supplyOrderLinkProblems`, a partir da linha lida no vínculo. */
export function toLinkEmpenhoFacts(
	empenhoRow: { unit_id: number | string | null; status: unknown },
	coveredArpItemIds: readonly string[]
): { unitId: number | null; status: string; coveredArpItemIds: readonly string[] } {
	return {
		unitId: empenhoRow.unit_id == null ? null : Number(empenhoRow.unit_id),
		status: String(empenhoRow.status),
		coveredArpItemIds,
	}
}

/** Update do vínculo: a NE e, quando o SICAF foi consultado, a situação e quem a reconheceu. */
export function buildEmpenhoLinkUpdate(input: {
	empenhoId: string
	updatedAt: string
	sicafStatus: string | null
	isSicafAcknowledged: boolean | undefined
	userId: string
}): { empenho_id: string; updated_at: string; sicaf_status?: string; sicaf_ack_by?: string | null } {
	return {
		empenho_id: input.empenhoId,
		updated_at: input.updatedAt,
		...(input.sicafStatus ? { sicaf_status: input.sicafStatus, sicaf_ack_by: input.isSicafAcknowledged ? input.userId : null } : {}),
	}
}
