import type { Edition, Person, Vacancy } from "@iefa/database/assignment-selection"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getAssignmentServerClient } from "@/lib/supabase.server"

export interface BoardData {
	editionId: string | null
	editions: Edition[]
	persons: Person[]
	// Vagas base (om/estado/total). O `chosen` é derivado das pessoas no cliente,
	// para que o realtime atualize o quadro sem refazer queries no banco.
	vacancies: Vacancy[]
}

async function fetchEditions(): Promise<Edition[]> {
	const supabase = getAssignmentServerClient()
	const { data, error } = await supabase.from("edition").select("*").order("name", { ascending: false })
	if (error) throw new Error(error.message)
	return data ?? []
}

/** Resolve a edição alvo: a explícita, senão a ativa, senão a mais recente. */
function resolveEditionId(editions: Edition[], requested?: string | null): string | null {
	if (requested && editions.some((e) => e.id === requested)) return requested
	const active = editions.find((e) => e.active)
	if (active) return active.id
	return editions[0]?.id ?? null
}

export const listEditionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<Edition[]> => {
	return fetchEditions()
})

export const getBoardFn = createServerFn({ method: "GET" })
	.validator(z.object({ editionId: z.string().uuid().nullish() }))
	.handler(async ({ data }): Promise<BoardData> => {
		const supabase = getAssignmentServerClient()
		const editions = await fetchEditions()
		const editionId = resolveEditionId(editions, data.editionId)

		if (!editionId) {
			return { editionId: null, editions, persons: [], vacancies: [] }
		}

		const [personsRes, vacanciesRes] = await Promise.all([
			supabase.from("person").select("*").eq("edition_id", editionId).order("classificacao", { ascending: true }),
			supabase.from("vacancy").select("*").eq("edition_id", editionId).order("om", { ascending: true }),
		])

		if (personsRes.error) throw new Error(personsRes.error.message)
		if (vacanciesRes.error) throw new Error(vacanciesRes.error.message)

		return {
			editionId,
			editions,
			persons: personsRes.data ?? [],
			vacancies: vacanciesRes.data ?? [],
		}
	})

const personChangesSchema = z
	.object({
		classificacao: z.number().int(),
		nome: z.string().min(1),
		localidade: z.string().nullable(),
		estado: z.string().nullable(),
		show_card: z.boolean(),
		show_om: z.boolean(),
		hide_card: z.boolean(),
	})
	.partial()

export const updatePersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number().int(), changes: personChangesSchema }))
	.handler(async ({ data }): Promise<Person> => {
		const supabase = getAssignmentServerClient()
		const { data: row, error } = await supabase.from("person").update(data.changes).eq("id", data.id).select("*").single()
		if (error) throw new Error(error.message)
		return row
	})

/** Ativa uma edição no telão (marca active=true e desmarca as demais). */
export const setActiveEditionFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.string().uuid() }))
	.handler(async ({ data }): Promise<void> => {
		const supabase = getAssignmentServerClient()
		const off = await supabase.from("edition").update({ active: false }).neq("id", data.editionId)
		if (off.error) throw new Error(off.error.message)
		const on = await supabase.from("edition").update({ active: true }).eq("id", data.editionId)
		if (on.error) throw new Error(on.error.message)
	})

/**
 * Chama um militar ao telão: exibe só o card dele (show_card), esconde os demais
 * e reseta a revelação da OM (show_om=false) até ele anunciar a vaga.
 */
export const callPersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.string().uuid(), personId: z.number().int() }))
	.handler(async ({ data }): Promise<void> => {
		const supabase = getAssignmentServerClient()
		const clear = await supabase.from("person").update({ show_card: false, show_om: false }).eq("edition_id", data.editionId)
		if (clear.error) throw new Error(clear.error.message)
		const show = await supabase.from("person").update({ show_card: true }).eq("id", data.personId)
		if (show.error) throw new Error(show.error.message)
	})

/**
 * Reseta o estado de apresentação de uma edição. `clearChoices=false` apenas
 * limpa os flags de telão (show_card/show_om/hide_card); `true` também apaga as
 * escolhas (localidade/estado), reiniciando a edição do zero.
 */
export const resetEditionFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.string().uuid(), clearChoices: z.boolean() }))
	.handler(async ({ data }): Promise<void> => {
		const supabase = getAssignmentServerClient()
		const changes = data.clearChoices
			? { show_card: false, show_om: false, hide_card: false, localidade: null, estado: null }
			: { show_card: false, show_om: false, hide_card: false }
		const { error } = await supabase.from("person").update(changes).eq("edition_id", data.editionId)
		if (error) throw new Error(error.message)
	})
