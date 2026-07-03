/**
 * Tipos do histórico de versões de insumo (espelham o snapshot do domínio
 * em packages/sisub-domain/src/operations/ingredient-versions.ts).
 */

export interface IngredientSnapshot {
	ingredient: {
		description: string | null
		folder_id: string | null
		folder_description: string | null
		measure_unit: string | null
		correction_factor: number | null
		ceafa_id: string | null
		ceafa_description: string | null
	}
	nutrition_reference?: {
		food_revision_id: string
		food_item_id: string
		source_id: string
		source_name: string
		external_code: string
		display_name: string
		group_name: string | null
		version_label: string
		citation: string | null
		base_quantity: number
		base_unit: string
		match_status: string | null
		linked_at: string | null
	} | null
	nutrients: { nutrient_id: string; name: string | null; value: number }[]
	product_items: {
		id: string
		description: string | null
		barcode: string | null
		purchase_measure_unit: string | null
		unit_content_quantity: number | null
		correction_factor: number | null
		purchase_item_id: string | null
	}[]
	purchase_links: {
		link_id: string
		purchase_item_id: string
		description: string | null
		catmat_item_codigo: number | null
		catmat_item_descricao: string | null
		purchase_measure_unit: string | null
		unit_price: number | null
		conversion_factor: number | null
		is_default: boolean
	}[]
}

export interface IngredientVersion {
	id: string
	ingredient_id: string
	version_number: number
	snapshot: IngredientSnapshot
	change_summary: string | null
	changed_by: string | null
	changed_by_name: string | null
	created_at: string
}
