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
}

export interface ProcurementParams {
	startDate: string
	endDate: string
	kitchenId?: number
	unitId?: number
}
