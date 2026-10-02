import type { Edition, Person, Vacancy } from "@iefa/database/assignment-selection"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAccess } from "@/lib/auth.server"
import { splitPersonChanges } from "@/lib/person-changes"
import { maskUnannouncedChoice } from "@/lib/person-visibility"
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

/** Resolve a edição do controlador: a explícita, senão a ativa, senão a mais recente. */
function resolveEditionId(editions: Edition[], requested?: string | null): string | null {
	if (requested && editions.some((e) => e.id === requested)) return requested
	const active = editions.find((e) => e.active)
	if (active) return active.id
	return editions[0]?.id ?? null
}

/** Pessoas e vagas de uma edição, numa ida só ao banco (as duas consultas em paralelo). */
async function fetchBoard(editions: Edition[], editionId: string | null): Promise<BoardData> {
	if (!editionId) return { editionId: null, editions, persons: [], vacancies: [] }

	const supabase = getAssignmentServerClient()
	const [personsRes, vacanciesRes] = await Promise.all([
		supabase.from("person").select("*").eq("edition_id", editionId).order("classificacao", { ascending: true }),
		supabase.from("vacancy").select("*").eq("edition_id", editionId).order("om", { ascending: true }),
	])

	if (personsRes.error) throw new Error(personsRes.error.message)
	if (vacanciesRes.error) throw new Error(vacanciesRes.error.message)

	return { editionId, editions, persons: personsRes.data ?? [], vacancies: vacanciesRes.data ?? [] }
}

/*
 * Leitura pública do telão: roda sem sessão, com o service role.
 *
 * - Só a edição ATIVA. O telão sempre segue a ativa; antes, qualquer um passava o id de outra
 *   edição e recebia a lista dela (a de 2025, encerrada, inclusive). Sem edição ativa o telão
 *   fica vazio, em vez de cair na mais recente.
 * - A OM armada e ainda não anunciada sai mascarada (`maskUnannouncedChoice`). O custo é um
 *   `map` sobre as ~40 linhas que já vieram: nenhuma consulta a mais no caminho do telão.
 *
 * O controlador lê por `getControllerBoardFn`, que exige a concessão e devolve tudo.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getBoardFn = createServerFn({ method: "GET" }).handler(async (): Promise<BoardData> => {
	const editions = await fetchEditions()
	const active = editions.find((e) => e.active) ?? null
	const board = await fetchBoard(editions, active?.id ?? null)
	return { ...board, persons: board.persons.map(maskUnannouncedChoice) }
})

/** Quadro do painel de controle: qualquer edição, com a OM armada visível. */
export const getControllerBoardFn = createServerFn({ method: "GET" })
	.validator(z.object({ editionId: z.uuid().nullish() }))
	.handler(async ({ data }): Promise<BoardData> => {
		await requireAccess()
		const editions = await fetchEditions()
		return fetchBoard(editions, resolveEditionId(editions, data.editionId))
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
		await requireAccess()
		const supabase = getAssignmentServerClient()
		const { choice, rest, hasChoice, hasRest } = splitPersonChanges(data.changes)

		// OM e confirmação consomem vaga: vão pela função do banco, que trava a vaga e
		// recusa OM fora da edição ou acima de `total_vagas` — inclusive com dois
		// controladores confirmando ao mesmo tempo. Roda antes do update comum, para que
		// uma recusa não deixe meia alteração gravada.
		let row: Person | null = null
		if (hasChoice) {
			const { data: applied, error } = await applyPersonChoice(supabase, data.id, choice)
			if (error) throw new Error(error.message)
			row = applied
		}
		if (hasRest || !row) {
			const { data: updated, error } = await supabase.from("person").update(rest).eq("id", data.id).select("*").single()
			if (error) throw new Error(error.message)
			row = updated
		}
		return row
	})

type AssignmentClient = ReturnType<typeof getAssignmentServerClient>

/**
 * `assignment_selection.apply_person_choice` (migration 20260921160500) ainda não está
 * nos tipos gerados de `@iefa/database` — o cast some quando os tipos forem regenerados
 * depois de aplicar a migration.
 */
function applyPersonChoice(supabase: AssignmentClient, personId: number, changes: Record<string, unknown>) {
	const rpc = supabase.rpc.bind(supabase) as unknown as (
		fn: "apply_person_choice",
		args: { p_person_id: number; p_changes: Record<string, unknown> }
	) => PromiseLike<{ data: Person | null; error: { message: string } | null }>
	return rpc("apply_person_choice", { p_person_id: personId, p_changes: changes })
}

/** Ativa uma edição no telão (marca active=true e desmarca as demais). */
export const setActiveEditionFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.uuid() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		const off = await supabase.from("edition").update({ active: false }).neq("id", data.editionId)
		if (off.error) throw new Error(off.error.message)
		const on = await supabase.from("edition").update({ active: true }).eq("id", data.editionId)
		if (on.error) throw new Error(on.error.message)
	})

/** Liga/desliga a tela de bloqueio do telão para uma edição. */
export const setEditionLockFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.uuid(), locked: z.boolean() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		const { error } = await supabase.from("edition").update({ locked: data.locked }).eq("id", data.editionId)
		if (error) throw new Error(error.message)
	})

/**
 * Chama um militar ao telão: exibe só o card dele (show_card), esconde os demais
 * e reseta a revelação da OM (show_om=false) até ele anunciar a vaga.
 */
export const callPersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.uuid(), personId: z.number().int() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		// O militar tem de ser da edição informada. Sem isto o `clear` apagava o telão de
		// uma edição e o `show` acendia o card de alguém de outra.
		const { data: person, error: personError } = await supabase
			.from("person")
			.select("id")
			.eq("id", data.personId)
			.eq("edition_id", data.editionId)
			.maybeSingle()
		if (personError) throw new Error(personError.message)
		if (!person) throw new Error("Militar não pertence a esta edição")

		const clear = await supabase.from("person").update({ show_card: false, show_om: false }).eq("edition_id", data.editionId)
		if (clear.error) throw new Error(clear.error.message)
		const show = await supabase.from("person").update({ show_card: true }).eq("id", data.personId).eq("edition_id", data.editionId)
		if (show.error) throw new Error(show.error.message)
	})

/**
 * Reseta o estado de apresentação de uma edição. `clearChoices=false` apenas
 * limpa os flags de telão (show_card/show_om/hide_card); `true` também apaga as
 * escolhas (localidade/estado), reiniciando a edição do zero.
 */
export const resetEditionFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.uuid(), clearChoices: z.boolean() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		const changes = data.clearChoices
			? { show_card: false, show_om: false, hide_card: false, localidade: null, estado: null }
			: { show_card: false, show_om: false, hide_card: false }
		const { error } = await supabase.from("person").update(changes).eq("edition_id", data.editionId)
		if (error) throw new Error(error.message)
	})
