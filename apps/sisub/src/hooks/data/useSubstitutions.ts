import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import type { SubstitutionEntry } from "@/lib/menu-substitutions"
import { queryKeys } from "@/lib/query-keys"
import { updateSubstitutionsFn } from "@/server/planning.fn"

export function useUpdateSubstitutions() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ menuItemId, substitutions }: { menuItemId: string; substitutions: Record<string, SubstitutionEntry> }) =>
			updateSubstitutionsFn({ data: { menuItemId, substitutions } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
			toast.success("Substituição registrada no item do dia.")
		},
		onError: (error) => {
			toast.error(`Erro ao salvar substituições: ${error.message}`)
		},
	})
}
