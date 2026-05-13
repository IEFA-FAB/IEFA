import { queryOptions } from "@tanstack/react-query"
import { fetchProcurementNeedsFn } from "@/server/procurement.fn"

// ============================================================================
// TYPES
// ============================================================================

export interface ProcurementNeed {
	folder_id: string | null
	folder_description: string | null
	ingredient_id: string
	ingredient_name: string
	measure_unit: string | null
	total_quantity: number
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
		queryKey: ["procurement", "needs", params] as const,
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
