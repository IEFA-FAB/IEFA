import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { emitPriceResearchReportFn, fetchPriceResearchReportFn, fetchQuantityMemoryFn, updateAtaDocumentSettingsFn } from "@/server/procurement-documents.fn"

export function useQuantityMemory(ataId: string | null) {
	return useQuery({
		queryKey: queryKeys.procurementDocuments.quantityMemory(ataId),
		queryFn: () => fetchQuantityMemoryFn({ data: { ataId: ataId as string } }),
		enabled: ataId != null,
		staleTime: 60 * 1000,
	})
}

/** Relatório de uma emissão; sem `emissionId`, a mais recente. */
export function usePriceResearchReport(ataId: string | null, emissionId: string | null) {
	return useQuery({
		queryKey: queryKeys.procurementDocuments.priceResearchReport(ataId, emissionId),
		queryFn: () => fetchPriceResearchReportFn({ data: { ataId: ataId as string, emissionId } }),
		enabled: ataId != null,
		staleTime: 5 * 60 * 1000,
	})
}

export function useEmitPriceResearchReport(ataId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => emitPriceResearchReportFn({ data: { ataId } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement_documents", "price_research", ataId] }),
		onError: (error) => toast.error(`Não gerou o relatório: ${error.message}`),
	})
}

export function useUpdateAtaDocumentSettings(ataId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (isBudgetConfidential: boolean) => updateAtaDocumentSettingsFn({ data: { ataId, isBudgetConfidential } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(ataId) }),
		onError: (error) => toast.error(`Não salvou: ${error.message}`),
	})
}
