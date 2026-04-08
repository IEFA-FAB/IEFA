import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UnitSettingsInput } from "@/server/unit-settings.fn"
import { fetchUnitSettingsFn, updateUnitSettingsFn } from "@/server/unit-settings.fn"

export function useUnitSettings(unitId: number) {
	return useQuery({
		queryKey: ["sisub", "unit-settings", unitId],
		queryFn: () => fetchUnitSettingsFn({ data: { unitId } }),
		staleTime: 300_000,
	})
}

export function useUpdateUnitSettings(unitId: number) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (settings: UnitSettingsInput) => updateUnitSettingsFn({ data: { unitId, settings } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "unit-settings", unitId] })
			// Invalida o cache de unidades usado pelo route layout
			queryClient.invalidateQueries({ queryKey: ["sisub", "units"] })
		},
	})
}
