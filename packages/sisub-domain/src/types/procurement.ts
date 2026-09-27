import type { DeliveryCycle } from "../operations/quantity-estimate-limits.ts"

export interface ProcurementNeed {
	folder_id: string | null
	folder_description: string | null
	ingredient_id: string
	ingredient_name: string
	measure_unit: string | null
	estimated_quantity: number
	purchase_item_id: string | null
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: number | null
	conversion_factor: number | null
	catmat_item_codigo: number | null
	catmat_item_descricao: string | null
	unit_price: number | null
	item_description: string | null
	/** UUID do item salvo no anexo (disponível apenas em anexos já persistidos) */
	quantity_estimate_item_id?: string | null
	/** Classe de conservação do item de compra — fallback do ciclo quando o insumo não tem o seu. */
	conservation_class?: string | null
	/** Ciclo de entrega padrão do INSUMO (`kitchen.ingredient.default_delivery_cycle`), para referência. */
	ingredient_delivery_cycle?: string | null
	/** Acréscimo da máxima escolhido no item; null herda o do anexo. */
	max_increase_percent?: number | null
	/** Ciclo de entrega efetivo NESTE anexo (`weekly` | `monthly`), gravado no item. */
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
