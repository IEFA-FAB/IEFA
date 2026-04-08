import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { KitchenSettingsInput } from "@/server/kitchen-settings.fn"
import { fetchKitchenSettingsFn, updateKitchenSettingsFn } from "@/server/kitchen-settings.fn"

export function useKitchenSettings(kitchenId: number) {
	return useQuery({
		queryKey: ["sisub", "kitchen-settings", kitchenId],
		queryFn: () => fetchKitchenSettingsFn({ data: { kitchenId } }),
		staleTime: 300_000,
	})
}

export function useUpdateKitchenSettings(kitchenId: number) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (settings: KitchenSettingsInput) => updateKitchenSettingsFn({ data: { kitchenId, settings } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "kitchen-settings", kitchenId] })
			// Invalida o cache de cozinhas usado pelo route layout
			queryClient.invalidateQueries({ queryKey: ["user", "kitchens"] })
		},
	})
}
