import type { DeliveryCycle } from "../operations/ata-quantity-limits.ts"

export interface ProcurementNeed {
	folder_id: string | null
	folder_description: string | null
	ingredient_id: string
	ingredient_name: string
	measure_unit: string | null
	total_quantity: number
	purchase_item_id: string | null
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: number | null
	conversion_factor: number | null
	catmat_item_codigo: number | null
	catmat_item_descricao: string | null
	unit_price: number | null
	item_description: string | null
	/** UUID do item salvo na ATA (disponível apenas em ATAs já persistidas) */
	ata_item_id?: string | null
	/** Classe de conservação do item de compra — fallback do ciclo quando o insumo não tem o seu. */
	conservation_class?: string | null
	/** Ciclo de entrega padrão do INSUMO (`kitchen.ingredient.default_delivery_cycle`), para referência. */
	ingredient_delivery_cycle?: string | null
	/** Margem da máxima escolhida no item; null herda a da ata. */
	max_margin_percent?: number | null
	/** Ciclo de entrega efetivo NESTA ata (`weekly` | `monthly`), gravado no item. */
	delivery_cycle?: DeliveryCycle | null
	/** Mínimo por pedido informado no item; null usa o sugerido. */
	min_order_quantity?: number | null
}

export interface ProcurementParams {
	startDate: string
	endDate: string
	kitchenId?: number
	unitId?: number
}
