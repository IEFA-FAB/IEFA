import type { ProcurementParams } from "@iefa/sisub-domain/types"
import { queryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchProcurementNeedsFn } from "@/server/procurement.fn"

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
