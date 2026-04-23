import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { McpApiKey } from "@/server/mcp-keys.fn"
import { createMcpKeyFn, deleteMcpKeyFn, listMcpKeysFn, revokeMcpKeyFn } from "@/server/mcp-keys.fn"

export type { McpApiKey }

// ============================================================================
// Query Options
// ============================================================================

export const mcpKeysQueryOptions = () =>
	queryOptions({
		queryKey: ["sisub", "mcp-keys"],
		queryFn: () => listMcpKeysFn(),
		staleTime: 30 * 1000,
	})

// ============================================================================
// Query Hooks
// ============================================================================

export function useMcpKeys() {
	return useQuery(mcpKeysQueryOptions())
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreateMcpKey() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (label: string) => createMcpKeyFn({ data: { label } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "mcp-keys"] })
			// Sem toast aqui — o caller exibe a chave em dialog
		},
		onError: (error) => {
			toast.error("Erro ao criar chave", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}

export function useRevokeMcpKey() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (id: string) => revokeMcpKeyFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "mcp-keys"] })
			toast.success("Chave revogada.")
		},
		onError: (error) => {
			toast.error("Erro ao revogar chave", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}

export function useDeleteMcpKey() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (id: string) => deleteMcpKeyFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "mcp-keys"] })
			toast.success("Chave removida.")
		},
		onError: (error) => {
			toast.error("Erro ao remover chave", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}
