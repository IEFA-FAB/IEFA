// hooks/useMessHalls.ts
// Uses centralized types from @/types/domain as per design system guidelines.

import { useQuery } from "@tanstack/react-query";
import type { MessHall, Unit } from "@/types/domain";
import supabase from "@/lib/supabase";

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
	// We reuse the client but set the schema explicitly to sisub for these tables.
	const sisub = supabase.schema("sisub");

	// Units
	const unitsQuery = useQuery<readonly Unit[], Error>({
		queryKey: ["sisub", "units"],
		refetchOnWindowFocus: false,
		staleTime: 120_000,
		retry: 1,
		queryFn: async () => {
			const { data, error } = await sisub
				.from("units")
				.select("id, code, display_name")
				.order("display_name", { ascending: true });

			if (error) throw error;

			return (data ?? []).map((row) => ({
				id: row.id,
				code: row.code,
				name: row.display_name,
			})) as Unit[];
		},
	});

	// Mess Halls
	const messHallsQuery = useQuery<readonly MessHall[], Error>({
		queryKey: ["sisub", "mess_halls"],
		refetchOnWindowFocus: false,
		staleTime: 120_000,
		retry: 1,
		queryFn: async () => {
			const { data, error } = await sisub
				.from("mess_halls")
				.select("id, unit_id, code, display_name")
				.order("display_name", { ascending: true });

			if (error) throw error;

			return (data ?? []).map((row) => ({
				id: row.id,
				unitId: row.unit_id,
				code: row.code,
				name: row.display_name,
			})) as MessHall[];
		},
	});

	return {
		units: unitsQuery.data ?? [],
		messHalls: messHallsQuery.data ?? [],
		// Quick derived structures
		messHallsByUnitId:
			(messHallsQuery.data ?? []).reduce<Record<number, MessHall[]>>(
				(acc, mh) => {
					if (!acc[mh.unitId]) {
						acc[mh.unitId] = [];
					}
					acc[mh.unitId].push(mh);
					return acc;
				},
				{},
			) ?? {},
		isLoading: unitsQuery.isPending || messHallsQuery.isPending,
		isRefetching: unitsQuery.isFetching || messHallsQuery.isFetching,
		error: unitsQuery.error?.message || messHallsQuery.error?.message || null,
	};
};
