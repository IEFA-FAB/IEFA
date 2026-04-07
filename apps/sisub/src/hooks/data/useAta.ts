import type { ProcurementAta } from "@iefa/database/sisub"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { calculateAtaNeedsFn, createAtaFn, deleteAtaFn, fetchAtaDetailsFn, fetchAtaListFn, updateAtaStatusFn } from "@/server/ata.fn"
import type { AtaWithDetails, AtaWizardState } from "@/types/domain/ata"

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useAtaList(unitId: number | null) {
	return useQuery({
		queryKey: ["procurement_ata", "list", unitId],
		queryFn: () => fetchAtaListFn({ data: { unitId: unitId as number } }) as Promise<ProcurementAta[]>,
		enabled: unitId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

export function useAtaDetails(ataId: string | null) {
	return useQuery({
		queryKey: ["procurement_ata", "details", ataId],
		queryFn: () => fetchAtaDetailsFn({ data: { ataId: ataId as string } }) as Promise<AtaWithDetails | null>,
		enabled: ataId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCalculateAtaNeeds() {
	return useMutation({
		mutationFn: (state: AtaWizardState) =>
			calculateAtaNeedsFn({
				data: { kitchenSelections: state.kitchenSelections },
			}),
		onError: (error) => toast.error(`Erro ao calcular necessidades: ${error.message}`),
	})
}

export function useCreateAta() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ unitId, wizardState, items }: { unitId: number; wizardState: AtaWizardState; items: Awaited<ReturnType<typeof calculateAtaNeedsFn>> }) =>
			createAtaFn({
				data: {
					unitId,
					title: wizardState.title,
					notes: wizardState.notes || undefined,
					kitchenSelections: wizardState.kitchenSelections,
					items,
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["procurement_ata", "list"] })
			toast.success(`ATA "${data?.title}" criada com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar ATA: ${error.message}`),
	})
}

export function useUpdateAtaStatus() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ ataId, status }: { ataId: string; status: "draft" | "published" | "archived" }) => updateAtaStatusFn({ data: { ataId, status } }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["procurement_ata"] })
			const labels: Record<string, string> = {
				draft: "Rascunho",
				published: "Publicada",
				archived: "Arquivada",
			}
			toast.success(`ATA atualizada para "${labels[variables.status]}"`)
		},
		onError: (error) => toast.error(`Erro ao atualizar status: ${error.message}`),
	})
}

export function useDeleteAta() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (ataId: string) => deleteAtaFn({ data: { ataId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["procurement_ata", "list"] })
			toast.success("ATA removida.")
		},
		onError: (error) => toast.error(`Erro ao remover ATA: ${error.message}`),
	})
}
