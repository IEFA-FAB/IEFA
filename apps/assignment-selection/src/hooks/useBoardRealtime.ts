import type { Person, Vacancy } from "@iefa/database/assignment-selection"
import { hashKey, type QueryKey, useQueryClient } from "@tanstack/react-query"
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
 * Com RLS, `person` só chega pelo canal para a edição ATIVA (policy de 20261001150100): o
 * controlador olhando uma edição inativa fica no poll de 2s, como já ficava sem WebSocket.
 *
 * @param resolvedEditionId edição efetivamente carregada (filtro do realtime)
 * @param queryKey          chave do cache que o canal atualiza (telão ou painel)
 * @param transformPerson   aplicado a cada linha antes de entrar no cache (o telão mascara
 *                          a OM não anunciada, igual ao que o servidor devolve no poll).
 *                          Passe uma função estável (de módulo): ela é dependência do canal.
 */
export function useBoardRealtime(resolvedEditionId: string | null, queryKey: QueryKey, transformPerson?: (person: Person) => Person) {
	const queryClient = useQueryClient()
	// A chave é recriada a cada render; o canal só se refaz quando o conteúdo dela muda (o hash
	// do próprio React Query). O closure usa a chave do render em que o efeito rodou, igual em
	// conteúdo à de qualquer render com o mesmo hash.
	const keyHash = hashKey(queryKey)

	// biome-ignore lint/correctness/useExhaustiveDependencies: `keyHash` representa `queryKey` (array recriado a cada render)
	useEffect(() => {
		if (!resolvedEditionId) return

		const key = queryKey
		const transform = (row: Person) => (transformPerson ? transformPerson(row) : row)
		const patch = (mutate: (d: BoardData) => BoardData) => queryClient.setQueryData<BoardData>(key, (old) => (old ? mutate(old) : old))
		const resync = () => queryClient.invalidateQueries({ queryKey: key })

		const filter = `edition_id=eq.${resolvedEditionId}`
		const channel = supabase
			.channel(`board-${resolvedEditionId}`)
			.on("postgres_changes", { event: "*", schema: ASSIGNMENT_SELECTION_DB_SCHEMA, table: "person", filter }, (payload) => {
				patch((d) => {
					if (payload.eventType === "DELETE") {
						const id = (payload.old as { id?: number }).id
						return { ...d, persons: d.persons.filter((p) => p.id !== id) }
					}
					const persons = upsertById(d.persons, transform(payload.new as Person)).sort((a, b) => a.classificacao - b.classificacao)
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
	}, [resolvedEditionId, keyHash, transformPerson, queryClient])
}
