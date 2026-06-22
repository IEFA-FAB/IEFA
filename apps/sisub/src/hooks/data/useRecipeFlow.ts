/**
 * Hooks do Fluxo de Produção: fetch do grafo, save (replace) e catálogo
 * (step templates + utensílios) com quick-add.
 */

import type { SaveRecipeFlow } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import { createStepTemplateFn, createUtensilFn, fetchRecipeFlowFn, listStepTemplatesFn, listUtensilsFn, saveRecipeFlowFn } from "@/server/recipe-flow.fn"

export function useRecipeFlow(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.recipeFlow.detail(recipeId),
		queryFn: () => fetchRecipeFlowFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 60 * 1000,
	})
}

export function useSaveRecipeFlow(recipeId: string | undefined) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: SaveRecipeFlow) => saveRecipeFlowFn({ data }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.recipeFlow.detail(recipeId) })
			if (result.warnings.length > 0) {
				toast.warning("Fluxo salvo com avisos", { description: result.warnings[0] })
			} else {
				toast.success("Fluxo de produção salvo")
			}
		},
		onError: (error) => {
			toast.error(`Erro ao salvar fluxo: ${error.message}`)
		},
	})
}

export function useStepTemplates(kitchenId: number | null | undefined) {
	return useQuery({
		queryKey: queryKeys.recipeFlow.stepTemplates(kitchenId),
		queryFn: () => listStepTemplatesFn({ data: { kitchenId: kitchenId ?? null } }),
		staleTime: 5 * 60 * 1000,
	})
}

export function useUtensils(kitchenId: number | null | undefined) {
	return useQuery({
		queryKey: queryKeys.recipeFlow.utensils(kitchenId),
		queryFn: () => listUtensilsFn({ data: { kitchenId: kitchenId ?? null } }),
		staleTime: 5 * 60 * 1000,
	})
}

export function useCreateStepTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: {
			name: string
			description?: string | null
			defaultDurationMinutes?: number | null
			kitchenId?: number | null
			utensilIds?: string[]
		}) => createStepTemplateFn({ data: { ...data, utensilIds: data.utensilIds ?? [] } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["step_templates"] })
			toast.success("Etapa adicionada ao catálogo")
		},
		onError: (error) => toast.error(`Erro ao criar etapa: ${error.message}`),
	})
}

export function useCreateUtensil() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { name: string; kitchenId?: number | null }) => createUtensilFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["utensils"] })
			toast.success("Utensílio adicionado")
		},
		onError: (error) => toast.error(`Erro ao criar utensílio: ${error.message}`),
	})
}
