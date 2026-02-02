import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import supabase from "@/lib/supabase"

export function useUpdateSubstitutions() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			menuItemId,
			substitutions,
		}: {
			menuItemId: string
			substitutions: Record<string, any>
		}) => {
			const { error } = await supabase
				.from("menu_items")
				.update({ substitutions })
				.eq("id", menuItemId)

			if (error) throw error
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success("Substituições salvas com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao salvar substituições: ${error.message}`)
		},
	})
}
