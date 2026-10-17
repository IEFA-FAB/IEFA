import type { ClearPlannedDays, RefreshRecipeVersionsInDays, ReplaceRecipeInDays, SetHeadcountInDays, ShiftPlannedDays } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { clearPlannedDaysFn, refreshRecipeVersionsInDaysFn, replaceRecipeInDaysFn, setHeadcountInDaysFn, shiftPlannedDaysFn } from "@/server/planning-bulk.fn"

const formatCount = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Edição em lote mexe no calendário, na lixeira e nas tarefas da Produção Cozinha. */
function useInvalidatePlanning() {
	const queryClient = useQueryClient()
	return () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
		queryClient.invalidateQueries({ queryKey: ["production"] })
		// A disputa de equipamento é função dos itens de cada refeição: mudou o dia, muda o alerta.
		queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
	}
}

/** O que ficou de fora por já estar em produção: dito, nunca calado. */
const describeStartedSkip = (n: number) =>
	n > 0 ? ` ${formatCount(n, "preparação já em produção ficou", "preparações já em produção ficaram")} como estava.` : ""

export function useClearPlannedDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: ClearPlannedDays) => clearPlannedDaysFn({ data }),
		onSuccess: (result) => {
			invalidate()
			toast.success(`${formatCount(result.removed, "preparação foi", "preparações foram")} para a lixeira.${describeStartedSkip(result.keptStarted)}`)
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
			const replaced =
				result.replaced > 0 ? ` ${formatCount(result.replaced, "preparação do destino foi", "preparações do destino foram")} para a lixeira.` : ""
			toast.success(
				`${formatCount(result.days, `dia ${verb.slice(0, -1)}`, `dias ${verb}`)} (${formatCount(result.items, "preparação", "preparações")}).${replaced}`
			)
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
					? ` ${formatCount(result.skippedDuplicate, "refeição já tinha", "refeições já tinham")} a nova preparação e ficaram como estavam.`
					: ""
			toast.success(`${formatCount(result.replaced, "preparação trocada", "preparações trocadas")}.${duplicate}${describeStartedSkip(result.skippedStarted)}`)
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
				result.merged > 0 ? ` ${formatCount(result.merged, "item repetido saiu", "itens repetidos saíram")} (a refeição já tinha a versão vigente).` : ""
			toast.success(
				`${formatCount(result.updated, "preparação atualizada", "preparações atualizadas")} para a versão vigente.${merged}${describeStartedSkip(result.skippedStarted)}`
			)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useSetHeadcountInDays() {
	const invalidate = useInvalidatePlanning()
	return useMutation({
		mutationFn: (data: SetHeadcountInDays) => setHeadcountInDaysFn({ data }),
		onSuccess: (result) => {
			invalidate()
			const changed =
				result.changedMeanwhile > 0
					? ` ${formatCount(result.changedMeanwhile, "refeição mudou", "refeições mudaram")} enquanto você editava e ficou como estava; confira.`
					: ""
			toast.success(`${formatCount(result.updated, "refeição atualizada", "refeições atualizadas")}.${changed}`)
		},
		onError: (error) => toast.error(error.message),
	})
}
