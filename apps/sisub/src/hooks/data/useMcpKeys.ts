import type { CreateMcpApiKey } from "@iefa/sisub-domain/schemas"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useAssuredMutation } from "@/hooks/auth/useAssuredMutation"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { queryKeys } from "@/lib/query-keys"
import type { McpApiKey } from "@/server/mcp-keys.fn"
import { createMcpKeyFn, deleteMcpKeyFn, listMcpKeysFn, revokeMcpKeyFn } from "@/server/mcp-keys.fn"

export type { McpApiKey }

// ============================================================================
// Query Options
// ============================================================================

export const mcpKeysQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.sisub.mcpKeys(),
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

/**
 * `useAssuredMutation`, e não `useMutation`: `createMcpKeyFn` está classificada como `"fresh"`
 * no registro de garantia — criar uma chave que age em nome do titular, sem senha e sem
 * segundo fator, é exatamente o tipo de operação que pede prova de identidade na hora.
 *
 * Quando o piso for ligado (grupo 9), a recusa do servidor vira modal por cima desta tela e a
 * criação é reenviada com o mesmo rótulo. Enquanto o piso está desligado, o wrapper é
 * transparente: nenhuma chamada a mais, nenhum modal.
 */
export function useCreateMcpKey() {
	const queryClient = useQueryClient()

	return useAssuredMutation({
		mutationFn: (input: CreateMcpApiKey) => createMcpKeyFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mcpKeys() })
			// Sem toast aqui — o caller exibe a chave em dialog
		},
		onError: (error) => {
			// Desistir do modal de elevação não é falha: um toast vermelho aqui mandaria a pessoa
			// procurar um problema que ela mesma acabou de decidir não ter.
			if (isElevationCancelled(error)) return
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
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mcpKeys() })
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
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mcpKeys() })
			toast.success("Chave removida.")
		},
		onError: (error) => {
			toast.error("Erro ao remover chave", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}
