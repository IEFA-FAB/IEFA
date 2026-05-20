import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import supabase from "@/lib/supabase"

const DEBOUNCE_MS = 500

export function useRealtimeSubscription(options: {
	table: "daily_menu" | "recipes" | "menu_items"
	event?: "INSERT" | "UPDATE" | "DELETE" | "*"
	queryKeyPrefix: readonly unknown[]
	message?: string
	onUpdate?: () => void
	silent?: boolean
	filter?: string
}) {
	const queryClient = useQueryClient()
	const { table, event = "*", queryKeyPrefix, message = "Dados atualizados por outro usuário", onUpdate, silent = false, filter } = options

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const handleChange = useCallback(
		(_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
			if (debounceRef.current) clearTimeout(debounceRef.current)

			debounceRef.current = setTimeout(() => {
				queryClient.invalidateQueries({ queryKey: queryKeyPrefix })

				if (!silent) {
					toast.info(message, {
						id: `realtime-${table}`,
						description: "Clique para recarregar",
						action: {
							label: "Recarregar",
							onClick: () => queryClient.refetchQueries({ queryKey: queryKeyPrefix }),
						},
						duration: 5000,
					})
				}

				onUpdate?.()
			}, DEBOUNCE_MS)
		},
		[queryClient, queryKeyPrefix, message, silent, table, onUpdate]
	)

	useEffect(() => {
		const channelName = filter ? `${table}-${filter}` : `${table}-changes`
		const pgFilter: Record<string, string> = { event, schema: "sisub", table }
		if (filter) pgFilter.filter = filter

		const channel = supabase.channel(channelName)
		channel.on("postgres_changes" as never, pgFilter as never, handleChange as never).subscribe()

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
			supabase.removeChannel(channel)
		}
	}, [table, event, filter, handleChange])
}
