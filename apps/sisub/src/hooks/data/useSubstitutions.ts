import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import supabase from "@/lib/supabase";

// Define Substitution type if not already in planning
// We'll assume a structure for now
// type Substitution = { original_product_id: string; new_product_id: string; rationale: string; ... }

export function useUpdateSubstitutions() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			menuItemId,
			substitutions,
		}: {
			menuItemId: string;
			substitutions: Record<string, any>;
		}) => {
			const { error } = await supabase
				.from("menu_items")
				.update({ substitutions })
				.eq("id", menuItemId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning"] });
			toast.success("Substituições salvas com sucesso!");
		},
		onError: (error) => {
			toast.error(`Erro ao salvar substituições: ${error.message}`);
		},
	});
}
