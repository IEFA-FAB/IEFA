// Painel de subsistência da unidade — leitura ÚNICA, pelo servidor.
//
// Antes este arquivo montava seis queries do navegador contra `https://api.iefa.com.br`, em
// rotas anônimas (`/api/rancho_previsoes`, `/api/wherewhowhen`, `/api/user-data`,
// `/api/user-military-data`, `/api/mess-halls`, `/api/units`). Além de dispensar sessão, o
// caminho de ids (`user-data?id=…`) aceitava qualquer lista e servia de enumerador de pessoas.
//
// Agora é uma server fn com guard de `local-analytics` na unidade, e o diretório de pessoas
// sai das linhas encontradas — não de uma lista escolhida pelo cliente.

import { queryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchUnitDashboardFn } from "@/server/dashboard.fn"

export type UnitDashboardParams = {
	unitId: number
	messHallId?: number
	startDate: string
	endDate: string
}

export const unitDashboardQueryOptions = (params: UnitDashboardParams) =>
	queryOptions({
		queryKey: queryKeys.dashboard.unit(params),
		queryFn: () => fetchUnitDashboardFn({ data: params }),
		staleTime: 1000 * 60 * 2,
		gcTime: 1000 * 60 * 10,
	})
