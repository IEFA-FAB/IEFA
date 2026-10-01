import { useSuspenseQuery } from "@tanstack/react-query"
import { getFacilitiesFn } from "@/server/pregoeiro.fn"
import { FACILITIES_QUERY_KEY, type Facilidades_pregoeiro } from "@/types/domain"

/**
 * `is_mine` depende de quem está vendo: a chave leva o usuário, senão a lista lida antes do
 * login (tudo `is_mine: false`) ficava em cache depois dele e a edição sumia.
 */
export function useFacilitiesPregoeiroQuery(currentUserId?: string) {
	return useSuspenseQuery<Facilidades_pregoeiro[]>({
		queryKey: [...FACILITIES_QUERY_KEY, currentUserId ?? null],
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
