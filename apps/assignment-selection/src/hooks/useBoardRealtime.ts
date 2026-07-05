import type { Person, Vacancy } from "@iefa/database/assignment-selection"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { ASSIGNMENT_SELECTION_DB_SCHEMA, supabase } from "@/lib/supabase"
import type { BoardData } from "@/server/assignment.fn"

function upsertById<T extends { id: number }>(list: T[], row: T): T[] {
	const idx = list.findIndex((r) => r.id === row.id)
	if (idx < 0) return [...list, row]
	const next = list.slice()
	next[idx] = row
	return next
}

/**
 * Realtime do telão: aplica cada mudança de `person`/`vacancy` diretamente no
 * cache da query (o payload já traz a linha completa via REPLICA IDENTITY FULL),
 * sem refetch — atualização instantânea e sem carga extra no banco. Só a troca
 * de edição ativa (tabela `edition`) dispara um refetch, por ser rara.
 *
 * @param resolvedEditionId edição efetivamente carregada (filtro do realtime)
 * @param requestedEdition  edição pedida na URL (compõe a queryKey)
 */
export function useBoardRealtime(resolvedEditionId: string | null, requestedEdition: string | undefined) {
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!resolvedEditionId) return

		const queryKey = ["board", requestedEdition ?? "default"] as const
		const patch = (mutate: (d: BoardData) => BoardData) => queryClient.setQueryData<BoardData>(queryKey, (old) => (old ? mutate(old) : old))
		const resync = () => queryClient.invalidateQueries({ queryKey })

		const filter = `edition_id=eq.${resolvedEditionId}`
		const channel = supabase
			.channel(`board-${resolvedEditionId}`)
			.on("postgres_changes", { event: "*", schema: ASSIGNMENT_SELECTION_DB_SCHEMA, table: "person", filter }, (payload) => {
				patch((d) => {
					if (payload.eventType === "DELETE") {
						const id = (payload.old as { id?: number }).id
						return { ...d, persons: d.persons.filter((p) => p.id !== id) }
					}
					const persons = upsertById(d.persons, payload.new as Person).sort((a, b) => a.classificacao - b.classificacao)
					return { ...d, persons }
				})
			})
			.on("postgres_changes", { event: "*", schema: ASSIGNMENT_SELECTION_DB_SCHEMA, table: "vacancy", filter }, (payload) => {
				patch((d) => {
					if (payload.eventType === "DELETE") {
						const id = (payload.old as { id?: number }).id
						return { ...d, vacancies: d.vacancies.filter((v) => v.id !== id) }
					}
					const vacancies = upsertById(d.vacancies, payload.new as Vacancy).sort((a, b) => (a.om ?? "").localeCompare(b.om ?? ""))
					return { ...d, vacancies }
				})
			})
			// Troca de edição ativa muda qual edição o telão segue → refetch (raro).
			.on("postgres_changes", { event: "*", schema: ASSIGNMENT_SELECTION_DB_SCHEMA, table: "edition" }, resync)
			.subscribe((status) => {
				// Ao (re)conectar, revalida uma vez para não perder mudanças ocorridas
				// enquanto o canal estava fora do ar.
				if (status === "SUBSCRIBED") resync()
			})

		return () => {
			supabase.removeChannel(channel)
		}
	}, [resolvedEditionId, requestedEdition, queryClient])
}
