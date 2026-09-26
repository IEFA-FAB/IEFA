import type { MoveOriginToDate, RecordMenuSubstitution, RemoveOriginFromDay, ReplaceDayWithTemplate, ReplaceMenuItemRecipe } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	fetchMenuItemSubstituteOptionsFn,
	moveOriginToDateFn,
	recordMenuSubstitutionFn,
	removeOriginFromDayFn,
	replaceDayWithTemplateFn,
	replaceMenuItemRecipeFn,
} from "@/server/planning-adjustments.fn"

/**
 * Imprevistos do Agendamento da Produção. Todos mexem no calendário, na lixeira e nas tarefas
 * da Produção Cozinha: invalida o agendamento inteiro e o quadro de produção.
 */
function useInvalidatePlanning() {
	const queryClient = useQueryClient()
	return () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
		queryClient.invalidateQueries({ queryKey: ["production"] })
		queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
	}
}

export function useRemoveOriginFromDay() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: RemoveOriginFromDay) => removeOriginFromDayFn({ data }),
		onSuccess: (result) => {
			invalidate()
			toast.success(`${result.removed} ${result.removed === 1 ? "preparação saiu" : "preparações saíram"} do dia — dá para restaurar na lixeira.`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useMoveOriginToDate() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: MoveOriginToDate) => moveOriginToDateFn({ data }),
		onSuccess: (result, input) => {
			invalidate()
			const [y, m, d] = input.toDate.split("-")
			toast.success(`${result.moved} ${result.moved === 1 ? "preparação foi" : "preparações foram"} para ${d}/${m}/${y}.`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useReplaceDayWithTemplate() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ReplaceDayWithTemplate) => replaceDayWithTemplateFn({ data }),
		onSuccess: (result) => {
			invalidate()
			toast.success(
				`Dia trocado: ${result.removed} ${result.removed === 1 ? "preparação foi" : "preparações foram"} para a lixeira e ${result.itemsCreated} entraram.`
			)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useReplaceMenuItemRecipe() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ReplaceMenuItemRecipe) => replaceMenuItemRecipeFn({ data }),
		onSuccess: () => {
			invalidate()
			toast.success("Preparação trocada — porções, grupo e origem mantidos.")
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useRecordMenuSubstitution() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: RecordMenuSubstitution) => recordMenuSubstitutionFn({ data }),
		onSuccess: () => {
			invalidate()
			toast.success("Substituição registrada no item do dia.")
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useMenuItemSubstituteOptions(menuItemId: string | null) {
	return useQuery({
		queryKey: ["planning", "substitute-options", menuItemId],
		queryFn: () => fetchMenuItemSubstituteOptionsFn({ data: { menuItemId: menuItemId as string } }),
		enabled: menuItemId != null,
		staleTime: 5 * 60 * 1000,
	})
}
