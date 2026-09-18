/**
 * As OMs selecionáveis no envio — `GET /api/v1/units`, com a apoiadora de cada uma.
 *
 * Qualquer autenticado lê: enviar documento não exige papel, e o documento pode ser
 * atribuído a qualquer OM. Quem vê o documento depois é que depende da OM escolhida.
 */

import { UnitsResponseSchema } from "@iefa/alpha-client/access"
import { queryOptions } from "@tanstack/react-query"
import { alphaRequest } from "./client"

export function unitsQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "units"] as const,
		queryFn: async () => UnitsResponseSchema.parse(await alphaRequest<unknown>("/api/v1/units", token)).units,
		enabled: !!token,
		// Cadastro de OM muda por migração, não por uso.
		staleTime: 10 * 60_000,
	})
}
