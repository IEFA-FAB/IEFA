import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useAssuredMutation } from "@/hooks/auth/useAssuredMutation"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { queryKeys } from "@/lib/query-keys"
import {
	createAcquisitionFn,
	deleteAcquisitionFn,
	linkArpAcquisitionFn,
	linkEmpenhoAcquisitionFn,
	listAcquisitionsFn,
	listActivityLinesFn,
	previewDispensaSumFn,
	updateAcquisitionFn,
} from "@/server/acquisition.fn"
import { createManualArpFn, importArpItemsFn, listUnitArpsFn } from "@/server/arp.fn"
import { createEmpenhoWithItemsFn, quickRegisterEmpenhoFn } from "@/server/empenho-document.fn"

type CreateAcquisitionInput = Parameters<typeof createAcquisitionFn>[0]["data"]
export type AcquisitionPatch = Omit<Parameters<typeof updateAcquisitionFn>[0]["data"], "acquisitionId">
type PreviewInput = Parameters<typeof previewDispensaSumFn>[0]["data"]
type ManualArpInput = Parameters<typeof createManualArpFn>[0]["data"]
type ImportArpInput = Parameters<typeof importArpItemsFn>[0]["data"]
export type CreateEmpenhoWithItemsInput = Parameters<typeof createEmpenhoWithItemsFn>[0]["data"]
export type QuickEmpenhoInput = Parameters<typeof quickRegisterEmpenhoFn>[0]["data"]

/** Contratações da unidade, NEs sem contratação de origem e ARPs sem contratação. */
export function useAcquisitionsOverview(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.acquisitions.overview(unitId),
		queryFn: () => listAcquisitionsFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
		staleTime: 30 * 1000,
	})
}

/** Prévia do somatório da dispensa enquanto o formulário é preenchido. */
export function useDispensaPreview(params: PreviewInput | null) {
	return useQuery({
		queryKey: queryKeys.acquisitions.dispensaPreview(params?.unitId ?? null, (params ?? {}) as Record<string, unknown>),
		queryFn: () => previewDispensaSumFn({ data: params as PreviewInput }),
		enabled: params != null,
		staleTime: 15 * 1000,
	})
}

/** Classes de material do CATMAT (ramo de atividade de bens). */
export function useActivityLines(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.acquisitions.activityLines(unitId),
		queryFn: () => listActivityLinesFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
		staleTime: 60 * 60 * 1000,
	})
}

/** ARPs da unidade (com os itens e o comprometimento local), opcionalmente de uma contratação. */
export function useUnitArps(unitId: number | null, acquisitionId: string | null = null) {
	return useQuery({
		queryKey: queryKeys.acquisitions.unitArps(unitId, acquisitionId),
		queryFn: () => listUnitArpsFn({ data: { unitId: unitId as number, ...(acquisitionId ? { acquisitionId } : {}) } }),
		enabled: unitId != null,
		staleTime: 60 * 1000,
	})
}

function useInvalidateAcquisitions(unitId: number) {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: queryKeys.acquisitions.all(unitId) })
}

/** Criar, remover e vincular. Toda escrita reavalia a lista (pendências e somatório mudam juntos). */
export function useAcquisitionMutations(unitId: number) {
	const invalidate = useInvalidateAcquisitions(unitId)
	const scope = { id: `acquisitions-${unitId}` }

	const create = useMutation({
		mutationFn: (data: Omit<CreateAcquisitionInput, "unitId">) => createAcquisitionFn({ data: { unitId, ...data } }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não registrou a contratação: ${error.message}`),
		scope,
	})
	const remove = useMutation({
		mutationFn: (acquisitionId: string) => deleteAcquisitionFn({ data: { acquisitionId } }),
		onSuccess: invalidate,
		onError: (error) => toast.error(error.message),
		scope,
	})
	const linkArp = useMutation({
		mutationFn: (data: { arpId: string; acquisitionId: string | null }) => linkArpAcquisitionFn({ data }),
		onSuccess: invalidate,
		onError: (error) => toast.error(`Não vinculou a ARP: ${error.message}`),
		scope,
	})
	// `linkEmpenhoAcquisitionFn` é `"session"` no registro de garantia.
	const linkEmpenho = useAssuredMutation({
		mutationFn: (data: { empenhoId: string; acquisitionId: string | null }) => linkEmpenhoAcquisitionFn({ data }),
		onSuccess: invalidate,
		onError: (error) => {
			if (!isElevationCancelled(error)) toast.error(`Não vinculou o empenho: ${error.message}`)
		},
		scope,
	})
	return { create, remove, linkArp, linkEmpenho }
}

/**
 * Edição de UMA contratação (SAVE_BEHAVIOR, modo B: grava sozinha). Uma mutation por card, para o
 * "Salvando…/Salvo" de um card não aparecer nos outros.
 */
export function useUpdateAcquisition(unitId: number, acquisitionId: string) {
	const invalidate = useInvalidateAcquisitions(unitId)
	return useMutation({
		mutationFn: (patch: AcquisitionPatch) => updateAcquisitionFn({ data: { acquisitionId, ...patch } }),
		onSuccess: invalidate,
		scope: { id: `acquisition-${acquisitionId}` },
	})
}

/** ARP cadastrada à mão (API fora do ar, ata de outro órgão). */
export function useCreateManualArp(unitId: number) {
	const invalidate = useInvalidateAcquisitions(unitId)
	return useMutation({
		mutationFn: (data: Omit<ManualArpInput, "unitId">) => createManualArpFn({ data: { unitId, ...data } }),
		onSuccess: (result) => {
			invalidate()
			toast.success(`ARP ${result.numeroAta} cadastrada — fica "não sincronizada" até a primeira importação do Compras.gov.br`)
		},
		onError: (error) => toast.error(error.message),
	})
}

/** ARP importada do Compras.gov.br, com ou sem anexo quantitativo. */
export function useImportArpForAcquisition(unitId: number) {
	const invalidate = useInvalidateAcquisitions(unitId)
	return useMutation({
		mutationFn: (data: ImportArpInput) => importArpItemsFn({ data: { ...data, unitId } }),
		onSuccess: (result) => {
			invalidate()
			toast.success(`ARP ${result.numero_ata} importada com ${result.items.length} ${result.items.length === 1 ? "item" : "itens"}`)
			for (const warning of result.warnings) toast.warning(warning)
		},
		onError: (error) => toast.error(`Não importou a ARP: ${error.message}`),
	})
}

/** NE com itens. `"session"` no registro de garantia. */
export function useCreateEmpenhoWithItems(unitId: number) {
	const invalidate = useInvalidateAcquisitions(unitId)
	return useAssuredMutation({
		mutationFn: (data: CreateEmpenhoWithItemsInput) => createEmpenhoWithItemsFn({ data }),
		onSuccess: (result) => {
			invalidate()
			toast.success(
				`NE ${result.numeroEmpenho} registrada${result.relinked > 0 ? ` — ${result.relinked} documento(s) do SIAFI que esperavam por ela foram religados` : ""}`
			)
		},
		onError: (error) => {
			if (!isElevationCancelled(error)) toast.error(error.message)
		},
	})
}

/**
 * Registro rápido da NE (número, data, valor, favorecido). `"session"` no registro de garantia.
 * Invalida a lista de contratações da unidade quando ela é conhecida; quem usa em outro módulo
 * (OF, recebimento) invalida o próprio cache no `onRegistered` do componente.
 */
export function useQuickRegisterEmpenho(unitId: number | null) {
	const queryClient = useQueryClient()
	return useAssuredMutation({
		mutationFn: (data: QuickEmpenhoInput) => quickRegisterEmpenhoFn({ data }),
		onSuccess: () => {
			if (unitId != null) queryClient.invalidateQueries({ queryKey: queryKeys.acquisitions.all(unitId) })
		},
		onError: (error) => {
			if (!isElevationCancelled(error)) toast.error(error.message)
		},
	})
}
