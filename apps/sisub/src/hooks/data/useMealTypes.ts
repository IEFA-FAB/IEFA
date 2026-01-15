import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import supabase from "@/lib/supabase";
import type {
	MealType,
	MealTypeInsert,
	MealTypeUpdate,
} from "@/types/supabase.types";

/**
 * Query options para buscar meal types disponíveis
 * Retorna tipos genéricos (kitchen_id NULL) + tipos específicos da kitchen
 */
export const mealTypesQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: ["meal_types", kitchenId],
		queryFn: async (): Promise<MealType[]> => {
			let query = supabase
				.from("meal_type")
				.select("*")
				.is("deleted_at", null)
				.order("sort_order");

			// Filtrar: tipos genéricos (NULL) OU tipos da kitchen específica
			if (kitchenId !== null) {
				query = query.or(`kitchen_id.is.null,kitchen_id.eq.${kitchenId}`);
			} else {
				query = query.is("kitchen_id", null);
			}

			const { data, error } = await query;

			if (error) {
				throw new Error(`Failed to fetch meal types: ${error.message}`);
			}

			return data || [];
		},
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000, // 5 minutes - meal types don't change frequently
	});

/**
 * Hook para buscar meal types disponíveis para uma kitchen
 *
 * Retorna tipos genéricos (kitchen_id NULL) + tipos customizados da kitchen
 *
 * @param kitchenId - ID da kitchen (null retorna apenas genéricos)
 *
 * @example
 * ```tsx
 * const { data: mealTypes, isLoading } = useMealTypes(kitchenId);
 * ```
 */
export function useMealTypes(kitchenId: number | null) {
	return useQuery(mealTypesQueryOptions(kitchenId));
}

/**
 * Hook para criar novo meal type customizado
 *
 * @example
 * ```tsx
 * const { mutate: createMealType, isPending } = useCreateMealType();
 *
 * createMealType({
 *   name: 'Jantar Especial',
 *   kitchen_id: 1,
 *   sort_order: 5,
 * });
 * ```
 */
export function useCreateMealType() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: MealTypeInsert) => {
			const { data, error } = await supabase
				.from("meal_type")
				.insert(payload)
				.select()
				.single();

			if (error) {
				throw new Error(`Failed to create meal type: ${error.message}`);
			}

			return data;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["meal_types"] });
			toast.success(`Tipo de refeição "${data.name}" criado com sucesso!`);
		},
		onError: (error) => {
			toast.error(`Erro ao criar tipo de refeição: ${error.message}`);
		},
	});
}

/**
 * Hook para atualizar meal type existente
 *
 * Apenas permite editar meal types customizados (kitchen_id NOT NULL)
 *
 * @example
 * ```tsx
 * const { mutate: updateMealType } = useUpdateMealType();
 *
 * updateMealType({
 *   id: 'uuid',
 *   name: 'Lanche da Tarde',
 *   sort_order: 3,
 * });
 * ```
 */
export function useUpdateMealType() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, ...updates }: { id: string } & MealTypeUpdate) => {
			const { data, error } = await supabase
				.from("meal_type")
				.update(updates)
				.eq("id", id)
				.select()
				.single();

			if (error) {
				throw new Error(`Failed to update meal type: ${error.message}`);
			}

			return data;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["meal_types"] });
			toast.success(`Tipo de refeição "${data.name}" atualizado!`);
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar tipo de refeição: ${error.message}`);
		},
	});
}

/**
 * Hook para soft-delete de meal type
 *
 * Apenas permite deletar meal types customizados (kitchen_id NOT NULL)
 *
 * @example
 * ```tsx
 * const { mutate: deleteMealType } = useDeleteMealType();
 *
 * deleteMealType('uuid');
 * ```
 */
export function useDeleteMealType() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("meal_type")
				.update({ deleted_at: new Date().toISOString() })
				.eq("id", id);

			if (error) {
				throw new Error(`Failed to delete meal type: ${error.message}`);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["meal_types"] });
			toast.success("Tipo de refeição removido!");
		},
		onError: (error) => {
			toast.error(`Erro ao remover tipo de refeição: ${error.message}`);
		},
	});
}

/**
 * Hook para restaurar meal type soft-deleted
 *
 * @example
 * ```tsx
 * const { mutate: restoreMealType } = useRestoreMealType();
 *
 * restoreMealType('uuid');
 * ```
 */
export function useRestoreMealType() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("meal_type")
				.update({ deleted_at: null })
				.eq("id", id);

			if (error) {
				throw new Error(`Failed to restore meal type: ${error.message}`);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["meal_types"] });
			toast.success("Tipo de refeição restaurado!");
		},
		onError: (error) => {
			toast.error(`Erro ao restaurar tipo de refeição: ${error.message}`);
		},
	});
}
