import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import type { UnitSettingsInput } from "@/server/unit-settings.fn"
import { fetchUnitSettingsFn, updateUnitSettingsFn } from "@/server/unit-settings.fn"

export function useUnitSettings(unitId: number) {
	return useQuery({
		queryKey: queryKeys.sisub.unitSettings(unitId),
		queryFn: () => fetchUnitSettingsFn({ data: { unitId } }),
		// `unitId` vem de `Number(params.unitId)`: sem o guard, uma rota com param
		// inválido dispara a busca com NaN.
		enabled: Number.isFinite(unitId) && unitId > 0,
		staleTime: 300_000,
	})
}

export function useUpdateUnitSettings(unitId: number) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (settings: UnitSettingsInput) => updateUnitSettingsFn({ data: { unitId, settings } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.unitSettings(unitId) })
			// Invalida o cache de unidades usado pelo route layout
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.units() })
		},
	})
}
