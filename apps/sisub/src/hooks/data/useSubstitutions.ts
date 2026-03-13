import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { updateSubstitutionsFn } from "@/server/planning.fn"

export function useUpdateSubstitutions() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			menuItemId,
			substitutions,
		}: {
			menuItemId: string
			substitutions: Record<string, { type: string; rationale: string; updated_at: string }>
		}) => updateSubstitutionsFn({ data: { id: menuItemId, substitutions } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success("Substituições salvas com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao salvar substituições: ${error.message}`)
		},
	})
}
