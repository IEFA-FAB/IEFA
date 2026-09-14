import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { toast } from "@/components/ui/toast"
import supabase from "@/lib/supabase"

/**
 * Janela de coalescência dos eventos. Uma rajada (edição em lote de outro usuário, dezenas de
 * rename/delete com concorrência 5) vira UMA invalidação no fim da janela — nunca uma por
 * evento.
 *
 * Incidente de 2026-09-13: o debounce era de 500 ms e reiniciava a cada evento, sem teto de
 * frequência. Com eventos chegando espaçados, cada um invalidava `["recipes"]` e refazia a
 * listagem de 14,5 MB; e o `cancelRefetch` padrão cancelava só a promise no cliente, enquanto
 * a requisição HTTP anterior continuava rodando no servidor. As respostas sobrepostas
 * atrasavam as escritas, os eventos seguintes chegavam mais espaçados, e o ciclo apertou
 * de ~45 s para ~5 s até as duas tasks do sisub caírem por OutOfMemory.
 */
const COALESCE_MS = 10_000

export function useRealtimeSubscription(options: {
	table: "daily_menu" | "recipes" | "menu_items"
	event?: "INSERT" | "UPDATE" | "DELETE" | "*"
	queryKeyPrefix: readonly unknown[]
	message?: string
	onUpdate?: () => void
	silent?: boolean
	filter?: string
	/** Schema da tabela. Default "kitchen" (onde vivem as tabelas realtime atuais
	 *  após o split); explícito para callers futuros de outros domínios. */
	schema?: string
}) {
	const queryClient = useQueryClient()
	const { table, event = "*", filter, schema = "kitchen" } = options

	// Opções voláteis em ref: `queryKeyPrefix` costuma vir como literal inline (novo array a
	// cada render) e `onUpdate` como arrow. Na dependência do efeito, cada render derrubava e
	// recriava o canal — e o `channel()` do supabase-js devolve o canal de mesmo tópico que
	// ainda está fechando.
	const latest = useRef(options)
	latest.current = options

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		const flush = () => {
			timerRef.current = null
			const { queryKeyPrefix, message = "Dados atualizados por outro usuário", onUpdate, silent = false } = latest.current
			// `cancelRefetch` fica no padrão (true) de propósito: reaproveitar uma busca em curso
			// (`false`) devolveria dado de ANTES da mudança e o marcaria como fresco por 5 min. A
			// busca antiga não é abortada no servidor, mas a janela acima limita isso a uma por
			// janela, e a listagem de receitas deixou de ter 14,5 MB.
			void queryClient.invalidateQueries({ queryKey: queryKeyPrefix })

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
		}

		const handleChange = (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
			// Janela fixa a partir do PRIMEIRO evento: eventos seguintes não a adiam (um fluxo
			// contínuo nunca atualizaria) nem abrem outra.
			if (timerRef.current) return
			timerRef.current = setTimeout(flush, COALESCE_MS)
		}

		const channelName = filter ? `${table}-${filter}` : `${table}-changes`
		// Tabelas realtime (daily_menu, recipes, menu_items) movidas p/ o schema kitchen.
		const pgFilter: Record<string, string> = { event, schema, table }
		if (filter) pgFilter.filter = filter

		const channel = supabase.channel(channelName)
		channel.on("postgres_changes" as never, pgFilter as never, handleChange as never).subscribe()

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
			timerRef.current = null
			supabase.removeChannel(channel)
		}
	}, [queryClient, table, schema, event, filter])
}
