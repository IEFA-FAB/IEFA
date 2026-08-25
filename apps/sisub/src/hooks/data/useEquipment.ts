/**
 * Hooks dos equipamentos: catálogo (papéis + modelos), parque da cozinha,
 * lista mínima da preparação e atendimento (a cozinha consegue produzir?).
 */

import type {
	CreateEquipmentModel,
	CreateEquipmentRole,
	CreateEquipmentUnit,
	SaveRecipeEquipment,
	UpdateEquipmentModel,
	UpdateEquipmentUnit,
} from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import {
	createEquipmentModelFn,
	createEquipmentRoleFn,
	createEquipmentUnitFn,
	deleteEquipmentModelFn,
	deleteEquipmentUnitFn,
	evaluateMenuEquipmentFitnessFn,
	evaluateRecipeEquipmentFitnessFn,
	fetchRecipeEquipmentFn,
	listEquipmentModelsFn,
	listEquipmentRolesFn,
	listKitchenEquipmentFn,
	saveRecipeEquipmentFn,
	setUtensilRoleFn,
	suggestRecipeEquipmentFromFlowFn,
	updateEquipmentModelFn,
	updateEquipmentUnitFn,
} from "@/server/equipment.fn"

const CATALOG_STALE_TIME = 5 * 60 * 1000

export function useEquipmentRoles(category?: string | null) {
	return useQuery({
		queryKey: queryKeys.equipment.roles(category),
		queryFn: () => listEquipmentRolesFn({ data: { category: (category ?? null) as never } }),
		staleTime: CATALOG_STALE_TIME,
	})
}

export function useEquipmentModels(kitchenId?: number | null, roleId?: string | null) {
	return useQuery({
		queryKey: queryKeys.equipment.models(kitchenId, roleId),
		queryFn: () => listEquipmentModelsFn({ data: { kitchenId: kitchenId ?? null, roleId: roleId ?? null } }),
		staleTime: CATALOG_STALE_TIME,
	})
}

export function useKitchenEquipment(kitchenId: number | undefined, includeInactive = false) {
	return useQuery({
		queryKey: queryKeys.equipment.kitchenUnits(kitchenId as number, includeInactive),
		queryFn: () => listKitchenEquipmentFn({ data: { kitchenId: kitchenId as number, includeInactive } }),
		enabled: kitchenId != null,
		staleTime: 60 * 1000,
	})
}

export function useRecipeEquipment(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.recipeRequirements(recipeId),
		queryFn: () => fetchRecipeEquipmentFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 60 * 1000,
	})
}

/**
 * Atendimento da preparação numa cozinha. Só faz sentido com as duas pontas conhecidas.
 * `portions` opcional acrescenta bateladas e ciclos à resposta (pergunta de volume).
 */
export function useRecipeEquipmentFitness(recipeId: string | undefined, kitchenId: number | null | undefined, portions?: number | null) {
	return useQuery({
		queryKey: queryKeys.equipment.fitness(recipeId, kitchenId ?? null, portions ?? null),
		queryFn: () => evaluateRecipeEquipmentFitnessFn({ data: { recipeId: recipeId as string, kitchenId: kitchenId as number, portions: portions ?? null } }),
		enabled: !!recipeId && kitchenId != null,
		staleTime: 60 * 1000,
	})
}

/**
 * Atendimento da refeição inteira: as preparações do mesmo `daily_menu` disputam o parque.
 * É o que a tela da preparação não vê — cada ficha isolada "atende", o almoço não.
 */
export function useMenuEquipmentFitness(dailyMenuId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.menuFitness(dailyMenuId),
		queryFn: () => evaluateMenuEquipmentFitnessFn({ data: { dailyMenuId: dailyMenuId as string } }),
		enabled: !!dailyMenuId,
		staleTime: 60 * 1000,
	})
}

/** Sugestões de exigência derivadas do fluxo (etapas com utensílio mapeado a papel). */
export function useRecipeEquipmentSuggestions(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.suggestions(recipeId),
		queryFn: () => suggestRecipeEquipmentFromFlowFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 60 * 1000,
	})
}

export function useSetUtensilRole() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { utensilId: string; roleId: string | null }) => setUtensilRoleFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.recipeFlow.utensilsAll() })
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Utensílio mapeado")
		},
		onError: (error) => toast.error(`Erro ao mapear utensílio: ${error.message}`),
	})
}

export function useSaveRecipeEquipment(recipeId: string | undefined) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: SaveRecipeEquipment) => saveRecipeEquipmentFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.recipeRequirements(recipeId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamentos da preparação salvos")
		},
		onError: (error) => toast.error(`Erro ao salvar equipamentos: ${error.message}`),
	})
}

export function useCreateEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentUnit) => createEquipmentUnitFn({ data }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar equipamento: ${error.message}`),
	})
}

export function useUpdateEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateEquipmentUnit) => updateEquipmentUnitFn({ data }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento atualizado")
		},
		onError: (error) => toast.error(`Erro ao atualizar equipamento: ${error.message}`),
	})
}

export function useDeleteEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (unitId: string) => deleteEquipmentUnitFn({ data: { unitId } }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento removido")
		},
		onError: (error) => toast.error(`Erro ao remover equipamento: ${error.message}`),
	})
}

export function useCreateEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentModel) => createEquipmentModelFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar modelo: ${error.message}`),
	})
}

export function useUpdateEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateEquipmentModel) => updateEquipmentModelFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo atualizado")
		},
		onError: (error) => toast.error(`Erro ao atualizar modelo: ${error.message}`),
	})
}

export function useDeleteEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (modelId: string) => deleteEquipmentModelFn({ data: { modelId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo removido")
		},
		onError: (error) => toast.error(`Erro ao remover modelo: ${error.message}`),
	})
}

export function useCreateEquipmentRole() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentRole) => createEquipmentRoleFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Papel cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar papel: ${error.message}`),
	})
}
