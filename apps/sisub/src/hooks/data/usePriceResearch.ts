import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { searchMaterialPricesFn } from "@/server/price-research.fn"
import type { ComprasMaterialPricePage } from "@/types/domain/price-research"

interface UsePriceResearchParams {
	catmatCode: number | null
	pagina?: number
	estado?: string | null
}

export function usePriceResearch({ catmatCode, pagina = 1, estado }: UsePriceResearchParams) {
	return useQuery({
		queryKey: queryKeys.compras.priceResearch(catmatCode, pagina, estado ?? null),
		queryFn: () =>
			searchMaterialPricesFn({
				data: {
					codigoItemCatalogo: catmatCode as number,
					pagina,
					...(estado ? { estado } : {}),
				},
			}) as Promise<ComprasMaterialPricePage>,
		enabled: catmatCode !== null,
		staleTime: 5 * 60 * 1000,
	})
}
