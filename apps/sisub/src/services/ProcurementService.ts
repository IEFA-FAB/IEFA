import { queryOptions } from "@tanstack/react-query"
import { fetchProcurementNeedsFn } from "@/server/procurement.fn"

// ============================================================================
// TYPES
// ============================================================================

export interface ProcurementNeed {
	folder_id: string | null
	folder_description: string | null
	product_id: string
	product_name: string
	measure_unit: string | null
	total_quantity: number
}

export interface ProcurementParams {
	startDate: string
	endDate: string
	kitchenId?: number
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
				},
			}),
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 15,
		enabled: !!params.startDate && !!params.endDate,
	})
