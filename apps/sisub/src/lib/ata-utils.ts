import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import type { ProcurementListItem } from "@/types/domain/ata"

export function ataItemToNeed(item: ProcurementListItem): ProcurementNeed {
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
	}
}
