// hooks/useMessHalls.ts
// Uses centralized types from @/types/domain as per design system guidelines.

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchMessHallsFn, fetchUnitsFn } from "@/server/mess-halls.fn"
import type { MessHall, Unit } from "@/types/domain/meal"

/**
 * Custom hook to fetch and manage organizational units and mess halls.
 *
 * @remarks
 * This hook fetches data from the sisub schema and maintains English naming
 * conventions in code while using actual table/column names for Supabase queries.
 *
 * Data is cached with a 2-minute stale time and automatically refetches on reconnection.
 * Window focus refetching is disabled to prevent unnecessary requests.
 *
 * @returns Object containing:
 * - `units` - Array of all organizational units
 * - `messHalls` - Array of all mess halls
 * - `messHallsByUnitId` - Map of mess halls grouped by unit ID
 * - `isLoading` - True during initial data fetch
 * - `isRefetching` - True during background refetches
 * - `error` - Error message if any query fails, null otherwise
 *
 * @example
 * ```tsx
 * const { units, messHalls, messHallsByUnitId, isLoading } = useMessHalls();
 *
 * if (isLoading) return <Skeleton />;
 *
 * return (
 *   <Select>
 *     {messHalls.map(mh => (
 *       <SelectItem key={mh.id} value={mh.code}>
 *         {mh.name}
 *       </SelectItem>
 *     ))}
 *   </Select>
 * );
 * ```
 */
export const useMessHalls = () => {
	// Units
	const {
		data: unitsData,
		isPending: unitsPending,
		isFetching: unitsFetching,
		error: unitsError,
	} = useQuery<readonly Unit[], Error>({
		queryKey: queryKeys.sisub.units(),
		refetchOnWindowFocus: false,
		staleTime: 600_000, // 10 minutes
		retry: 1,
		queryFn: () => fetchUnitsFn(),
	})

	// Mess Halls
	const {
		data: messHallsData,
		isPending: messHallsPending,
		isFetching: messHallsFetching,
		error: messHallsError,
	} = useQuery<readonly MessHall[], Error>({
		queryKey: queryKeys.sisub.messHalls(),
		refetchOnWindowFocus: false,
		staleTime: 600_000, // 10 minutes
		retry: 1,
		queryFn: () => fetchMessHallsFn(),
	})

	return {
		units: unitsData ?? [],
		messHalls: messHallsData ?? [],
		// Quick derived structures
		messHallsByUnitId:
			(messHallsData ?? []).reduce<Record<number, MessHall[]>>((acc, mh) => {
				if (!acc[mh.unit_id]) {
					acc[mh.unit_id] = []
				}
				acc[mh.unit_id].push(mh)
				return acc
			}, {}) ?? {},
		isLoading: unitsPending || messHallsPending,
		isRefetching: unitsFetching || messHallsFetching,
		error: unitsError?.message || messHallsError?.message || null,
	}
}
