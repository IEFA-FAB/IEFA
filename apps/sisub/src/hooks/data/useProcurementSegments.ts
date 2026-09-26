import type { SegmentRuleMode } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	addProcurementSegmentRuleFn,
	createProcurementSegmentFn,
	deleteProcurementSegmentFn,
	fetchSegmentationOverviewFn,
	removeProcurementSegmentRuleFn,
	updateProcurementSegmentFn,
} from "@/server/procurement-segments.fn"

/** Contratações da OM e a resolução de cada item dos cardápios dela. */
export function useSegmentationOverview(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.procurementSegments.overview(unitId),
		queryFn: () => fetchSegmentationOverviewFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
		staleTime: 30 * 1000,
	})
}

/**
 * Mutations da segmentação. Toda escrita reavalia a segmentação inteira: uma regra nova pode
 * tirar item de outra contratação ou criar conflito, e a tela mostra isso na hora.
 * `scope` enfileira as gravações da mesma OM na ordem em que foram feitas (SAVE_BEHAVIOR, modo B).
 */
export function useSegmentMutations(unitId: number) {
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.procurementSegments.overview(unitId) })
	const scope = { id: `procurement-segments-${unitId}` }

	const create = useMutation({
		mutationFn: (data: { name: string; plannedMonth: number | null; validityMonths: number; leadTimeMonths: number }) =>
			createProcurementSegmentFn({ data: { unitId, ...data } }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não criou a contratação: ${error.message}`),
		scope,
	})
	const update = useMutation({
		mutationFn: (data: {
			segmentId: string
			name?: string
			description?: string | null
			plannedMonth?: number | null
			leadTimeMonths?: number
			validityMonths?: number
			pcaIdentifier?: string | null
		}) => updateProcurementSegmentFn({ data }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não salvou a contratação: ${error.message}`),
		scope,
	})
	const remove = useMutation({
		mutationFn: (segmentId: string) => deleteProcurementSegmentFn({ data: { segmentId } }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não removeu a contratação: ${error.message}`),
		scope,
	})
	const addRule = useMutation({
		mutationFn: (data: { segmentId: string; mode: SegmentRuleMode; folderId?: string | null; purchaseItemId?: string | null }) =>
			addProcurementSegmentRuleFn({ data }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não incluiu a regra: ${error.message}`),
		scope,
	})
	const removeRule = useMutation({
		mutationFn: (ruleId: string) => removeProcurementSegmentRuleFn({ data: { ruleId } }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não removeu a regra: ${error.message}`),
		scope,
	})
	return { create, update, remove, addRule, removeRule }
}
