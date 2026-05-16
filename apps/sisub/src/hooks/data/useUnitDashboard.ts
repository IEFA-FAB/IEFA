import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import type { UnitDashboardData } from "@/server/unit-dashboard.fn"
import { fetchUnitDashboardFn } from "@/server/unit-dashboard.fn"

export type { UnitDashboardData }

export function useUnitDashboard(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.unitDashboard(unitId),
		queryFn: () => fetchUnitDashboardFn({ data: { unitId: unitId as number } }) as Promise<UnitDashboardData>,
		enabled: unitId !== null,
		staleTime: 3 * 60 * 1000, // 3 min
	})
}
