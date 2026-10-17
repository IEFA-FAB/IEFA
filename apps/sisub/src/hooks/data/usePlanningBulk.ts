import type { ClearPlannedDays, RefreshRecipeVersionsInDays, ReplaceRecipeInDays, ShiftPlannedDays } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { clearPlannedDaysFn, refreshRecipeVersionsInDaysFn, replaceRecipeInDaysFn, shiftPlannedDaysFn } from "@/server/planning-bulk.fn"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Edição em lote mexe no calendário, na lixeira e nas tarefas da Produção Cozinha. */
function useInvalidatePlanning() {
	const queryClient = useQueryClient()
	return () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
		queryClient.invalidateQueries({ queryKey: ["production"] })
	}
}

/** O que ficou de fora por já estar em produção: dito, nunca calado. */
const startedNote = (n: number) => (n > 0 ? ` ${plural(n, "preparação já em produção ficou", "preparações já em produção ficaram")} como estava.` : "")

export function useClearPlannedDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ClearPlannedDays) => clearPlannedDaysFn({ data }),
		onSuccess: (result) => {
			invalidate()
			toast.success(`${plural(result.removed, "preparação foi", "preparações foram")} para a lixeira.${startedNote(result.keptStarted)}`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useShiftPlannedDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ShiftPlannedDays) => shiftPlannedDaysFn({ data }),
		onSuccess: (result, input) => {
			invalidate()
			const verb = input.mode === "move" ? "movidos" : "copiados"
			const replaced = result.replaced > 0 ? ` ${plural(result.replaced, "preparação do destino foi", "preparações do destino foram")} para a lixeira.` : ""
			toast.success(`${plural(result.days, `dia ${verb.slice(0, -1)}`, `dias ${verb}`)} (${plural(result.items, "preparação", "preparações")}).${replaced}`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useReplaceRecipeInDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ReplaceRecipeInDays) => replaceRecipeInDaysFn({ data }),
		onSuccess: (result) => {
			invalidate()
			const duplicate =
				result.skippedDuplicate > 0
					? ` ${plural(result.skippedDuplicate, "refeição já tinha", "refeições já tinham")} a nova preparação e ficaram como estavam.`
					: ""
			toast.success(`${plural(result.replaced, "preparação trocada", "preparações trocadas")}.${duplicate}${startedNote(result.skippedStarted)}`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useRefreshRecipeVersionsInDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: RefreshRecipeVersionsInDays) => refreshRecipeVersionsInDaysFn({ data }),
		onSuccess: (result) => {
			invalidate()
			const merged =
				result.merged > 0 ? ` ${plural(result.merged, "item repetido saiu", "itens repetidos saíram")} (a refeição já tinha a versão vigente).` : ""
			toast.success(
				`${plural(result.updated, "preparação atualizada", "preparações atualizadas")} para a versão vigente.${merged}${startedNote(result.skippedStarted)}`
			)
		},
		onError: (error) => toast.error(error.message),
	})
}
