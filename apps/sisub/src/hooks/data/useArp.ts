import type { Empenho } from "@iefa/database/sisub"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import { anularEmpenhoFn, createEmpenhoFn, fetchArpForAtaFn, fetchEmpenhosFn, importArpItemsFn, searchArpFn, syncArpBalanceFn } from "@/server/arp.fn"
import type { ArpWithItems, ComprasArpPage, CreateEmpenhoPayload } from "@/types/domain/arp"

// ─── Query: ARP vinculada à ATA ───────────────────────────────────────────────

export function useArpForAta(ataId: string | null) {
	return useQuery({
		queryKey: queryKeys.ata.arp(ataId),
		queryFn: () => fetchArpForAtaFn({ data: { ataId: ataId as string } }) as Promise<ArpWithItems | null>,
		enabled: ataId !== null,
		staleTime: 2 * 60 * 1000, // 2 min — pode mudar após sync
	})
}

// ─── Query: Empenhos de um item da ARP ───────────────────────────────────────

export function useEmpenhos(arpItemId: string | null) {
	return useQuery({
		queryKey: queryKeys.ata.empenhos(arpItemId),
		queryFn: () => fetchEmpenhosFn({ data: { arpItemId: arpItemId as string } }) as Promise<Empenho[]>,
		enabled: arpItemId !== null,
		staleTime: 1 * 60 * 1000,
	})
}

// ─── Mutation: Buscar ARPs no Compras.gov.br ──────────────────────────────────

export function useSearchArp() {
	return useMutation({
		mutationFn: (params: { uasgGerenciadora: string; numeroAta?: string; anoAta?: string }) => searchArpFn({ data: params }) as Promise<ComprasArpPage>,
		onError: (error) => toast.error(`Erro ao buscar ARP: ${error.message}`),
	})
}

// ─── Mutation: Importar ARP (busca itens + persiste) ─────────────────────────

export function useImportArp(ataId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: Parameters<typeof importArpItemsFn>[0]["data"]) => importArpItemsFn({ data: params }),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.arp(ataId) })
			const n = data.items.length
			toast.success(`ARP ${data.numero_ata}/${data.ano_ata ?? ""} importada com ${n} ${n === 1 ? "item" : "itens"}`)
		},
		onError: (error) => toast.error(`Erro ao importar ARP: ${error.message}`),
	})
}

// ─── Mutation: Sincronizar saldo de empenhos ──────────────────────────────────

export function useSyncArpBalance(ataId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (arpId: string) => syncArpBalanceFn({ data: { arpId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.arp(ataId) })
			toast.success("Saldo de empenhos sincronizado com Compras.gov.br")
		},
		onError: (error) => toast.error(`Erro ao sincronizar saldo: ${error.message}`),
	})
}

// ─── Mutation: Registrar empenho ──────────────────────────────────────────────

export function useCreateEmpenho(arpItemId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (payload: CreateEmpenhoPayload) => createEmpenhoFn({ data: payload }),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.empenhos(arpItemId) })
			toast.success(`Empenho ${data.numero_empenho} registrado com sucesso`)
		},
		onError: (error) => toast.error(`Erro ao registrar empenho: ${error.message}`),
	})
}

// ─── Mutation: Anular empenho ─────────────────────────────────────────────────

export function useAnularEmpenho(arpItemId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (empenhoId: string) => anularEmpenhoFn({ data: { empenhoId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.empenhos(arpItemId) })
			toast.success("Empenho anulado")
		},
		onError: (error) => toast.error(`Erro ao anular empenho: ${error.message}`),
	})
}
