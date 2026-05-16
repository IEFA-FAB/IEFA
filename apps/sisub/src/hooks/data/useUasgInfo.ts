import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchUasgInfoFn } from "@/server/uasg-lookup.fn"

/**
 * Consulta os dados de uma UASG diretamente na API pública do Compras.gov.br
 * (módulo-uasg endpoint 8.1).
 *
 * A query só dispara quando `codigoUasg` tiver exatamente 6 dígitos.
 * O cache é mantido por 30 minutos, pois os dados de UASG mudam raramente.
 */
export function useUasgInfo(codigoUasg: string | null | undefined) {
	const enabled = typeof codigoUasg === "string" && /^\d{6}$/.test(codigoUasg)

	return useQuery({
		queryKey: queryKeys.compras.uasg(codigoUasg),
		queryFn: () => fetchUasgInfoFn({ data: { codigoUasg: codigoUasg ?? "" } }),
		enabled,
		staleTime: 30 * 60 * 1000,
		retry: 1,
	})
}
