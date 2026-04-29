// hooks/useAppsData.ts
import { useSuspenseQuery } from "@tanstack/react-query"
import { getAppsFn } from "@/server/pregoeiro.fn"
import type { DbApp } from "@/types/domain"

export const APPS_QUERY_KEY = "appsData"

export function useAppsData(limit = 50) {
	return useSuspenseQuery({
		queryKey: [APPS_QUERY_KEY, limit],
		queryFn: (): Promise<DbApp[]> => getAppsFn({ data: { limit } }) as Promise<DbApp[]>,
		staleTime: 1000 * 60 * 10, // 10 minutos
	})
}
