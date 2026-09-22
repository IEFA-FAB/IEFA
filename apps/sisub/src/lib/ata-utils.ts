import { isDeliveryCycle } from "@iefa/sisub-domain"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import type { AtaItemWithConservation } from "@/types/domain/ata"

export function ataItemToNeed(item: AtaItemWithConservation): ProcurementNeed {
	return {
		folder_id: item.folder_id,
		folder_description: item.folder_description,
		ingredient_id: item.ingredient_id || item.id,
		ingredient_name: item.ingredient_name,
		measure_unit: item.measure_unit,
		total_quantity: Number(item.total_quantity),
		purchase_item_id: item.purchase_item_id ?? null,
		purchase_item_description: item.purchase_item_description ?? null,
		purchase_measure_unit: item.purchase_measure_unit ?? null,
		purchase_quantity: item.purchase_quantity !== null && item.purchase_quantity !== undefined ? Number(item.purchase_quantity) : null,
		conversion_factor: item.conversion_factor !== null && item.conversion_factor !== undefined ? Number(item.conversion_factor) : null,
		catmat_item_codigo: item.catmat_item_codigo,
		catmat_item_descricao: item.catmat_item_descricao,
		unit_price: item.unit_price !== null ? Number(item.unit_price) : null,
		item_description: item.item_description ?? null,
		ata_item_id: item.id,
		conservation_class: item.conservation_class ?? null,
		max_margin_percent: item.max_margin_percent ?? null,
		ingredient_delivery_cycle: item.ingredient_delivery_cycle ?? null,
		delivery_cycle: isDeliveryCycle(item.delivery_cycle) ? item.delivery_cycle : null,
		min_order_quantity: item.min_order_quantity != null ? Number(item.min_order_quantity) : null,
	}
}

/**
 * Unidade do insumo diferente da unidade de compra com fator 1 (ou sem fator): quase sempre
 * vínculo mal cadastrado, não conversão real — "Mel" em UN comprado em KG virava 60.060 KG.
 * A ATA não bloqueia (o cadastro é da SDAB), mas a quantidade não pode passar calada.
 */
export function hasSuspiciousUnitConversion(item: Pick<ProcurementNeed, "measure_unit" | "purchase_measure_unit" | "conversion_factor">): boolean {
	const from = item.measure_unit?.trim().toUpperCase()
	const to = item.purchase_measure_unit?.trim().toUpperCase()
	if (!from || !to || from === to) return false
	return (item.conversion_factor ?? 1) === 1
}
