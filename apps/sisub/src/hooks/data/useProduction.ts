import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import { ensureProductionTasksFn, fetchProductionBoardFn, updateProductionTaskStatusFn } from "@/server/production.fn"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

export const productionBoardQueryOptions = (kitchenId: number | null, date: string) =>
	queryOptions({
		queryKey: queryKeys.production.board(kitchenId as number, date),
		queryFn: () =>
			fetchProductionBoardFn({
				data: { kitchenId: kitchenId as number, date },
			}),
		enabled: !!kitchenId && !!date,
	})

// ---------------------------------------------------------------------------
// useProductionBoard
// ---------------------------------------------------------------------------
// Hook principal do painel. Garante que as tasks existam antes de retornar os dados:
// 1. ensure (POST) → cria tasks PENDING para itens sem task
// 2. board (GET) → busca tasks + recipe details

export function useProductionBoard(kitchenId: number | null, date: string) {
	return useQuery({
		...productionBoardQueryOptions(kitchenId, date),
		queryFn: async () => {
			if (!kitchenId) return []

			// Garante tasks PENDING para todos os menu_items do dia
			await ensureProductionTasksFn({ data: { kitchenId, date } })

			// Busca o board completo
			return fetchProductionBoardFn({ data: { kitchenId, date } })
		},
		// Atualiza a cada 30s — útil em ambientes multi-terminal
		refetchInterval: 30_000,
	})
}

// ---------------------------------------------------------------------------
// useUpdateTaskStatus
// ---------------------------------------------------------------------------
// Mutation com optimistic update: atualiza o status no cache imediatamente,
// revertendo em caso de erro.

export function useUpdateTaskStatus() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ taskId, status }: { taskId: string; status: ProductionTaskStatus; kitchenId: number; date: string }) =>
			updateProductionTaskStatusFn({ data: { taskId, status } }),

		onMutate: async ({ taskId, status, kitchenId, date }) => {
			const queryKey = queryKeys.production.board(kitchenId, date)

			// Cancela refetches em andamento para evitar sobrescrever o optimistic update
			await queryClient.cancelQueries({ queryKey })

			// Snapshot para rollback
			const previous = queryClient.getQueryData<ProductionItem[]>(queryKey)

			// Optimistic update
			queryClient.setQueryData<ProductionItem[]>(queryKey, (old) =>
				(old ?? []).map((item) => {
					if (item.task.id !== taskId) return item
					const now = new Date().toISOString()
					return {
						...item,
						task: {
							...item.task,
							status,
							started_at: status === "IN_PROGRESS" ? (item.task.started_at ?? now) : status === "PENDING" ? null : item.task.started_at,
							completed_at: status === "DONE" ? now : status === "PENDING" ? null : item.task.completed_at,
							updated_at: now,
						},
					}
				})
			)

			return { previous, queryKey }
		},

		onError: (_error, _vars, context) => {
			// Rollback
			if (context?.previous !== undefined) {
				queryClient.setQueryData(context.queryKey, context.previous)
			}
			toast.error("Erro ao atualizar status da preparação")
		},

		onSuccess: (_data, { kitchenId, date }) => {
			// Invalida para garantir consistência com o banco
			queryClient.invalidateQueries({ queryKey: queryKeys.production.board(kitchenId, date) })
		},
	})
}
