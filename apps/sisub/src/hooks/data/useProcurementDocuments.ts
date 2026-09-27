import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	emitPriceResearchReportFn,
	fetchPriceResearchReportFn,
	fetchQuantityMemoryFn,
	updateQuantityEstimateDocumentSettingsFn,
} from "@/server/procurement-documents.fn"

export function useQuantityMemory(quantityEstimateId: string | null) {
	return useQuery({
		queryKey: queryKeys.procurementDocuments.quantityMemory(quantityEstimateId),
		queryFn: () => fetchQuantityMemoryFn({ data: { quantityEstimateId: quantityEstimateId as string } }),
		enabled: quantityEstimateId != null,
		staleTime: 60 * 1000,
	})
}

/** Relatório de uma emissão; sem `emissionId`, a mais recente. */
export function usePriceResearchReport(quantityEstimateId: string | null, emissionId: string | null) {
	return useQuery({
		queryKey: queryKeys.procurementDocuments.priceResearchReport(quantityEstimateId, emissionId),
		queryFn: () => fetchPriceResearchReportFn({ data: { quantityEstimateId: quantityEstimateId as string, emissionId } }),
		enabled: quantityEstimateId != null,
		staleTime: 5 * 60 * 1000,
	})
}

export function useEmitPriceResearchReport(quantityEstimateId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => emitPriceResearchReportFn({ data: { quantityEstimateId } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement_documents", "price_research", quantityEstimateId] }),
		onError: (error) => toast.error(`Não gerou o relatório: ${error.message}`),
	})
}

export function useUpdateQuantityEstimateDocumentSettings(quantityEstimateId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (isBudgetConfidential: boolean) => updateQuantityEstimateDocumentSettingsFn({ data: { quantityEstimateId, isBudgetConfidential } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(quantityEstimateId) }),
		onError: (error) => toast.error(`Não salvou: ${error.message}`),
	})
}
