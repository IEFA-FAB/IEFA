import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { getFacilitiesFn } from "@/server/pregoeiro.fn"
import { FACILITIES_QUERY_KEY, type Facilidades_pregoeiro } from "@/types/domain"

/**
 * Biblioteca de frases. `is_mine` vem do servidor, calculado pela sessão do request: o SSR já
 * chega certo. Quando o usuário da tela muda depois de montada (entrou, saiu), a lista é
 * revalidada em segundo plano — sem pôr o usuário na chave, o que suspenderia a tabela e
 * mostraria o esqueleto a cada carga com sessão.
 */
export function useFacilitiesPregoeiroQuery(currentUserId?: string) {
	const queryClient = useQueryClient()
	const seenUserId = useRef(currentUserId)
	useEffect(() => {
		if (seenUserId.current === currentUserId) return
		seenUserId.current = currentUserId
		void queryClient.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY })
	}, [currentUserId, queryClient])

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

/** Revalida a biblioteca depois de criar ou editar frase (a frase nova chega com `is_mine`). */
export function useInvalidateFacilities() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY })
}
