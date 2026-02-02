import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"
import supabase from "@/lib/supabase"

/**
 * Hook para subscrições Realtime do Supabase
 *
 * Escuta mudanças em tempo real e invalida queries relevantes
 * Mostra toast não-intrusivo quando dados são atualizados por outros usuários
 *
 * @example
 * ```tsx
 * // Em um componente de planejamento
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
	const {
		table,
		event = "*",
		queryKeyPrefix,
		message = "Dados atualizados por outro usuário",
		onUpdate,
		silent = false,
	} = options

	useEffect(() => {
		// Criar canal único para esta subscrição
		const channel = supabase
			.channel(`${table}-changes`)
			.on(
				"postgres_changes",
				{
					event,
					schema: "sisub",
					table: table as any,
				},
				(payload: RealtimePostgresChangesPayload<any>) => {
					console.log(`[Realtime] ${table} changed:`, payload)

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

/**
 * Hook agregado para múltiplas subscrições Realtime
 *
 * Útil quando um componente precisa escutar mudanças em múltiplas tabelas
 *
 * @example
 * ```tsx
 * useRealtimeSubscriptions([
 *   { table: 'daily_menu', queryKeyPrefix: ['planning'] },
 *   { table: 'recipes', queryKeyPrefix: ['recipes'] },
 * ]);
 * ```
 */
