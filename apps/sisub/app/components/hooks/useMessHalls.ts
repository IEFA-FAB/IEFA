// hooks/useMessHalls.ts
import { useQuery } from "@tanstack/react-query";
import supabase from "~/utils/supabase";

// Domain types (English)
export interface Unit {
    id: number;
    code: string;
    name: string | null;
}

export interface MessHall {
    id: number;
    unitId: number;
    code: string;
    name: string | null;
}

// Lightweight UI options
export interface Option {
    code: string;
    name: string;
}

/**
 * Fetch Units and Mess Halls from sisub schema.
 * - Keeps English naming in code.
 * - Supabase queries use actual table/column names.
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
            (messHallsQuery.data ?? []).reduce<Record<number, MessHall[]>>((acc, mh) => {
                (acc[mh.unitId] ??= []).push(mh);
                return acc;
            }, {}) ?? {},
        isLoading: unitsQuery.isPending || messHallsQuery.isPending,
        isRefetching: unitsQuery.isFetching || messHallsQuery.isFetching,
        error: unitsQuery.error?.message || messHallsQuery.error?.message || null,
    };
};
