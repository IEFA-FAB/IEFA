import { queryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchProcurementNeedsFn } from "@/server/procurement.fn"

// ============================================================================
// TYPES
// ============================================================================

export interface ProcurementNeed {
	// Kitchen domain
	folder_id: string | null
	folder_description: string | null
	ingredient_id: string
	ingredient_name: string
	measure_unit: string | null
	total_quantity: number
	// Purchase domain (from purchase_item via is_default link)
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

// ============================================================================
// QUERY OPTIONS
// ============================================================================

export const procurementNeedsQueryOptions = (params: ProcurementParams) =>
	queryOptions({
		queryKey: queryKeys.ata.needs(params),
		queryFn: () =>
			fetchProcurementNeedsFn({
				data: {
					startDate: params.startDate,
					endDate: params.endDate,
					kitchenId: params.kitchenId,
					unitId: params.unitId,
				},
			}),
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 15,
		enabled: !!params.startDate && !!params.endDate,
	})
