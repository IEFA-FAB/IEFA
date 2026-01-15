import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import supabase from "@/lib/supabase";
import type { Kitchen, Unit } from "@/types/supabase.types";

/**
 * Kitchen com informações da unit proprietária
 */
export interface KitchenWithUnit extends Kitchen {
	unit: Unit | null;
}

/**
 * Hook para buscar kitchens disponíveis para o usuário atual
 *
 * @returns Query com lista de kitchens ordenadas por ID
 *
 * @example
 * ```tsx
 * const { data: kitchens, isLoading } = useUserKitchens();
 * ```
 */
export function useUserKitchens() {
	return useQuery({
		queryKey: ["user", "kitchens"],
		queryFn: async (): Promise<KitchenWithUnit[]> => {
			const { data, error } = await supabase
				.from("kitchen")
				.select(
					`
          *,
          unit:units!kitchen_unit_id_fkey(*)
        `,
				)
				.order("id");

			if (error) {
				throw new Error(`Failed to fetch kitchens: ${error.message}`);
			}

			return data || [];
		},
		staleTime: 10 * 60 * 1000, // 10 minutes - kitchens rarely change
	});
}

/**
 * Hook para gerenciar a kitchen selecionada com persistência
 *
 * Persiste a seleção em localStorage e query params
 *
 * @returns Objeto com kitchenId atual e função para alterar
 *
 * @example
 * ```tsx
 * const { kitchenId, setKitchenId } = useKitchenPreference();
 * ```
 */
export function useKitchenPreference() {
	const queryClient = useQueryClient();
	const STORAGE_KEY = "sisub:selected_kitchen_id";

	// Obter kitchen ID do localStorage ou query param
	const getInitialKitchenId = (): number | null => {
		// Tentar query param primeiro
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const paramKitchenId = params.get("kitchen_id");
			if (paramKitchenId) {
				const id = Number.parseInt(paramKitchenId, 10);
				if (!Number.isNaN(id)) {
					return id;
				}
			}

			// Fallback para localStorage
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const id = Number.parseInt(stored, 10);
				if (!Number.isNaN(id)) {
					return id;
				}
			}
		}

		return null;
	};

	const [kitchenId, setKitchenIdState] = React.useState<number | null>(
		getInitialKitchenId,
	);

	const setKitchenId = React.useCallback(
		(id: number | null) => {
			setKitchenIdState(id);

			if (typeof window !== "undefined") {
				if (id !== null) {
					// Persistir em localStorage
					localStorage.setItem(STORAGE_KEY, id.toString());

					// Atualizar query param sem recarregar página
					const url = new URL(window.location.href);
					url.searchParams.set("kitchen_id", id.toString());
					window.history.replaceState({}, "", url.toString());
				} else {
					// Limpar localStorage e query param
					localStorage.removeItem(STORAGE_KEY);
					const url = new URL(window.location.href);
					url.searchParams.delete("kitchen_id");
					window.history.replaceState({}, "", url.toString());
				}
			}

			// Invalidar queries relacionadas ao planejamento
			queryClient.invalidateQueries({ queryKey: ["daily_menus"] });
			queryClient.invalidateQueries({ queryKey: ["meal_types"] });
		},
		[queryClient],
	);

	return {
		kitchenId,
		setKitchenId,
	};
}

/**
 * Hook combinado que retorna kitchens disponíveis e preferência selecionada
 *
 * Útil quando precisa tanto da lista quanto da seleção
 *
 * @example
 * ```tsx
 * const { kitchens, kitchenId, setKitchenId, isLoading } = useKitchenSelector();
 * ```
 */
export function useKitchenSelector() {
	const { data: kitchens, isLoading } = useUserKitchens();
	const { kitchenId, setKitchenId } = useKitchenPreference();

	// Auto-select primeira kitchen se usuário tem apenas uma e nenhuma selecionada
	React.useEffect(() => {
		if (kitchens && kitchens.length === 1 && kitchenId === null) {
			setKitchenId(kitchens[0].id);
		}
	}, [kitchens, kitchenId, setKitchenId]);

	return {
		kitchens: kitchens || [],
		kitchenId,
		setKitchenId,
		isLoading,
	};
}
