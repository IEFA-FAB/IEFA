import { useSuspenseQuery } from "@tanstack/react-query"
import { getFacilitiesFn } from "@/server/pregoeiro.fn"
import { FACILITIES_QUERY_KEY, type Facilidades_pregoeiro } from "@/types/domain"

export function useFacilitiesPregoeiroQuery() {
	return useSuspenseQuery<Facilidades_pregoeiro[]>({
		queryKey: FACILITIES_QUERY_KEY,
		queryFn: async () => {
			const data = (await getFacilitiesFn()) as Facilidades_pregoeiro[]
			return data.map((item) => ({
				...item,
				tags: item.tags ?? [],
				default: item.default ?? false,
			}))
		},
		staleTime: 1000 * 60 * 10,
		refetchOnWindowFocus: false,
	})
}
