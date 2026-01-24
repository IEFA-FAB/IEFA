import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
	FACILITIES_QUERY_KEY,
	type Facilidades_pregoeiro,
} from "@/types/domain";

export function useFacilitiesPregoeiroQuery() {
	return useSuspenseQuery<Facilidades_pregoeiro[]>({
		queryKey: FACILITIES_QUERY_KEY,
		queryFn: async () => {
			const { data, error } = await supabase
				.schema("iefa")
				.from("facilities_pregoeiro")
				.select("*");

			if (error) throw new Error(error.message);
			if (!data) return [];

			const base = data as Facilidades_pregoeiro[];

			return base.map((item) => ({
				...item,
				tags: item.tags ?? [],
				default: item.default ?? false,
			}));
		},
		staleTime: 1000 * 60 * 10,
		refetchOnWindowFocus: false,
	});
}
