import type { CreateMenuGroupSet, DeleteMenuGroupSet, MenuGroupSetRow, UpdateMenuGroupSet } from "@iefa/sisub-domain"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "@/components/ui/toast"
import { DEFAULT_MENU_GROUPS, type MenuGroup } from "@/lib/menu-item-groups"
import { queryKeys } from "@/lib/query-keys"
import { createMenuGroupSetFn, deleteMenuGroupSetFn, fetchMenuGroupSetsFn, updateMenuGroupSetFn } from "@/server/menu-groups.fn"

export type { MenuGroupSetRow }

/**
 * Conjuntos de grupos visíveis para a cozinha: os globais da SDAB mais os dela.
 * `kitchenId` null busca só os globais (telas do escopo global).
 */
export const menuGroupSetsQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: queryKeys.menuGroupSets.byKitchen(kitchenId),
		queryFn: (): Promise<MenuGroupSetRow[]> => fetchMenuGroupSetsFn({ data: { kitchenId } }),
		// Conjunto muda tão pouco quanto tipo de refeição — e é lido em toda célula
		// do editor semanal.
		staleTime: 5 * 60 * 1000,
	})

export function useMenuGroupSets(kitchenId: number | null) {
	return useQuery(menuGroupSetsQueryOptions(kitchenId))
}

type MealTypeLike = { id: string; group_set_id?: string | null }

/**
 * Resolve, para cada refeição, os grupos do conjunto dela.
 *
 * Refeição sem conjunto (linha antiga) cai no padrão — o do almoço. Devolver
 * lista vazia abriria o editor sem coluna nenhuma e o cardápio pareceria vazio,
 * que é exatamente o tipo de tela que mente calada.
 */
export function useMealTypeGroups(kitchenId: number | null, mealTypes: MealTypeLike[] | undefined) {
	const { data: sets, isError } = useMenuGroupSets(kitchenId)

	return useMemo(() => {
		const byId = new Map((sets ?? []).map((s) => [s.id, s.groups.map((g): MenuGroup => ({ key: g.key, label: g.label }))]))
		const byMealType = new Map<string, readonly MenuGroup[]>()
		for (const mt of mealTypes ?? []) {
			const groups = mt.group_set_id ? byId.get(mt.group_set_id) : undefined
			byMealType.set(mt.id, groups?.length ? groups : DEFAULT_MENU_GROUPS)
		}

		/** Grupos da refeição, com o conjunto padrão como último recurso. */
		const groupsFor = (mealTypeId: string | null | undefined): readonly MenuGroup[] =>
			(mealTypeId ? byMealType.get(mealTypeId) : undefined) ?? DEFAULT_MENU_GROUPS

		/**
		 * Rótulo por chave, atravessando todos os conjuntos — para quem renderiza
		 * cardápio sem saber de que refeição ele veio (visão do comensal). Chave
		 * repetida entre conjuntos (`bebida`) fica com o primeiro rótulo; são
		 * sinônimos, e escolher entre "Bebida" e "Bebidas" não muda o que se lê.
		 */
		const labelByKey = new Map<string, string>()
		for (const set of sets ?? []) {
			for (const g of set.groups) if (!labelByKey.has(g.key)) labelByKey.set(g.key, g.label)
		}
		const allGroups: MenuGroup[] = [...labelByKey].map(([key, label]) => ({ key, label }))

		// `isError` sobe junto porque o fallback é indistinguível de um conjunto de
		// verdade: com a busca falhada, TODA refeição ganha as colunas do almoço, os
		// itens do café viram órfãos na tela e o "Adicionar" arquiva prato novo em
		// `salada`. Quem renderiza precisa poder dizer isso ao usuário.
		return { sets: sets ?? [], groupsFor, allGroups, isError }
	}, [sets, mealTypes, isError])
}

export function useCreateMenuGroupSet() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateMenuGroupSet) => createMenuGroupSetFn({ data }),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.menuGroupSets.all() })
			toast.success(`Conjunto "${data.name}" criado.`)
		},
		onError: (error) => toast.error(`Erro ao criar conjunto: ${error.message}`),
	})
}

export function useUpdateMenuGroupSet() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateMenuGroupSet) => updateMenuGroupSetFn({ data }),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.menuGroupSets.all() })
			// O cardápio lê o rótulo e a ordem das colunas do conjunto: sem isto a
			// tela aberta continuaria mostrando os grupos antigos até o cache expirar.
			queryClient.invalidateQueries({ queryKey: queryKeys.mealTypes.all() })
			toast.success(`Conjunto "${data.name}" atualizado.`)
		},
		onError: (error) => toast.error(`Erro ao atualizar conjunto: ${error.message}`),
	})
}

export function useDeleteMenuGroupSet() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: DeleteMenuGroupSet) => deleteMenuGroupSetFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.menuGroupSets.all() })
			toast.success("Conjunto removido.")
		},
		onError: (error) => toast.error(`Erro ao remover conjunto: ${error.message}`),
	})
}
