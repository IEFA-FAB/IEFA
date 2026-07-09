import { queryOptions } from "@tanstack/react-query"
import { getBoardFn } from "@/server/assignment.fn"

/**
 * Dados do painel (pessoas + status de vagas + edições) para uma edição.
 * `editionId` indefinido → o servidor resolve a edição ativa/mais recente.
 */
export const boardQueryOptions = (editionId?: string | null) =>
	queryOptions({
		queryKey: ["board", editionId ?? "default"] as const,
		queryFn: () => getBoardFn({ data: { editionId: editionId ?? null } }),
		// Realtime aplica cada mudança direto no cache (push instantâneo, sem refetch).
		// Além dele, um poll de 2s garante frescor mesmo se o WebSocket cair — carga
		// desprezível (2 queries pequenas por ciclo).
		refetchInterval: 2000,
		refetchIntervalInBackground: true,
	})
