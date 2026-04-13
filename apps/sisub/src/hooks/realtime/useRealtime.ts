import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"
import supabase from "@/lib/supabase"

/**
 * Hook para subscrições Realtime do Supabase
 *
 * ⚠️ Este hook usa o Supabase client diretamente por necessidade:
 * Realtime subscriptions são WebSockets client-side — não podem ser server functions.
 * Por isso, vive em hooks/realtime/ (não hooks/data/) para não violar a regra
 * "data hooks só usam useQuery/useMutation sobre server functions".
 *
 * @example
 * ```tsx
 * useRealtimeSubscription({
 *   table: 'daily_menu',
 *   event: '*',
 *   queryKeyPrefix: ['planning'],
 *   message: 'Cardápio atualizado por outro usuário'
 * });
 * ```
 */
export function useRealtimeSubscription(options: {
	/** Tabela do Supabase para escutar */
	table: "daily_menu" | "recipes" | "menu_items"
	/** Evento a escutar: INSERT, UPDATE, DELETE, ou * para todos */
	event?: "INSERT" | "UPDATE" | "DELETE" | "*"
	/** Prefixo da query key para invalidar (ex: ['planning'] invalida todas queries de planejamento) */
	queryKeyPrefix: readonly unknown[]
	/** Mensagem do toast (opcional) */
	message?: string
	/** Callback adicional quando houver update (opcional) */
	onUpdate?: () => void
	/** Se true, não mostra toast (default: false) */
	silent?: boolean
}) {
	const queryClient = useQueryClient()
	const { table, event = "*", queryKeyPrefix, message = "Dados atualizados por outro usuário", onUpdate, silent = false } = options

	useEffect(() => {
		// Criar canal único para esta subscrição
		const channel = supabase
			.channel(`${table}-changes`)
			.on(
				"postgres_changes",
				{
					event,
					schema: "sisub",
					table,
				},
				(_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
					// Invalidar queries relevantes
					queryClient.invalidateQueries({
						queryKey: queryKeyPrefix,
					})

					// Mostrar toast não-intrusivo
					if (!silent) {
						toast.info(message, {
							description: "Clique para recarregar",
							action: {
								label: "Recarregar",
								onClick: () => {
									queryClient.refetchQueries({
										queryKey: queryKeyPrefix,
									})
								},
							},
							duration: 5000,
						})
					}

					// Callback adicional
					onUpdate?.()
				}
			)
			.subscribe()

		// Cleanup: desinscrever ao desmontar
		return () => {
			supabase.removeChannel(channel)
		}
	}, [table, event, queryKeyPrefix, message, onUpdate, silent, queryClient])
}
