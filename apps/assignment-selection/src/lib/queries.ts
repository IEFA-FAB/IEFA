import { queryOptions } from "@tanstack/react-query"
import { getBoardFn, getControllerBoardFn } from "@/server/assignment.fn"

/**
 * Realtime aplica cada mudança direto no cache (push instantâneo, sem refetch). Além dele,
 * um poll de 2s garante frescor mesmo se o WebSocket cair — carga desprezível (2 queries
 * pequenas por ciclo).
 */
const POLL = { refetchInterval: 2000, refetchIntervalInBackground: true } as const

/** Telão público: sempre a edição ativa, com a OM ainda não anunciada mascarada. */
export const boardQueryOptions = () =>
	queryOptions({
		queryKey: ["board", "public"] as const,
		queryFn: () => getBoardFn(),
		...POLL,
	})

/**
 * Painel de controle (exige a concessão): qualquer edição, com a OM armada visível.
 * Chave própria — telão e painel no mesmo navegador não podem dividir o cache, senão um
 * leria a versão mascarada e o outro a completa.
 * `editionId` indefinido → o servidor resolve a edição ativa/mais recente.
 */
export const controllerBoardQueryOptions = (editionId?: string | null) =>
	queryOptions({
		queryKey: ["controller-board", editionId ?? "default"] as const,
		queryFn: () => getControllerBoardFn({ data: { editionId: editionId ?? null } }),
		...POLL,
	})
