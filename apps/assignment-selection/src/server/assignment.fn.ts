import type { Json } from "@iefa/database"
import type { Edition, Person, Vacancy } from "@iefa/database/assignment-selection"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAccess } from "@/lib/auth.server"
import {
	type CallPersonRpcArgs,
	callPersonRpcArgs,
	conductErrorMessage,
	type ExpectedState,
	expectedFilters,
	STALE_SCREEN_MESSAGE,
	splitPersonChanges,
} from "@/lib/person-changes"
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

/** O que a tela viu do militar; o servidor só grava se a linha ainda estiver assim. */
const expectedSchema = z
	.object({
		localidade: z.string().nullable(),
		show_card: z.boolean(),
		show_om: z.boolean(),
		hide_card: z.boolean(),
	})
	.partial()

export const updatePersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number().int(), changes: personChangesSchema, expected: expectedSchema.optional() }))
	.handler(async ({ data }): Promise<Person> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		const { choice, rest, hasChoice, hasRest } = splitPersonChanges(data.changes)
		const expected = data.expected

		// Escolha e flags vão por caminhos diferentes (função do banco e update comum). Com
		// estado esperado, as duas juntas não seriam uma transação só; a condução nunca
		// mistura, então mistura com `expected` é recusada em vez de meio conferida.
		if (expected && hasChoice && hasRest) throw new Error("Alteração mista não confere o estado da tela")

		// OM e confirmação vão pela função do banco, que recusa OM fora do quadro da
		// edição (sem teto de vagas: a escolha pode mudar na hora) e confere `expected`
		// com o militar travado. Roda antes do update comum, para que uma recusa não deixe
		// meia alteração gravada.
		let row: Person | null = null
		if (hasChoice) {
			const { data: applied, error } = await applyPersonChoice(supabase, data.id, choice, expected ?? null)
			if (error) throw new Error(conductErrorMessage(error))
			row = applied
		}
		if (hasRest || !row) {
			// Update condicional numa instrução só: a linha muda se, e só se, ainda estiver
			// como a tela viu. Zero linhas = outro controle andou antes.
			let query = supabase.from("person").update(rest).eq("id", data.id)
			for (const f of expected ? expectedFilters(expected) : []) {
				query = f.op === "is" ? query.is(f.column, null) : query.eq(f.column, f.value as string | boolean)
			}
			const { data: updated, error } = await query.select("*").maybeSingle()
			if (error) throw new Error(error.message)
			if (!updated) throw new Error(expected ? STALE_SCREEN_MESSAGE : "Militar não encontrado")
			row = updated
		}
		return row
	})

type AssignmentClient = ReturnType<typeof getAssignmentServerClient>

/**
 * `assignment_selection.apply_person_choice`: grava a escolha, recusa OM fora do quadro da
 * edição e confere o estado que a tela viu.
 */
function applyPersonChoice(supabase: AssignmentClient, personId: number, changes: Record<string, unknown>, expected: ExpectedState | null) {
	// `p_expected` (migration 20261011130000) ainda não está nos tipos gerados; o cast some
	// depois do `db:types`.
	const rpc = supabase.rpc.bind(supabase) as unknown as (
		fn: "apply_person_choice",
		args: { p_person_id: number; p_changes: Json; p_expected: Json | null }
	) => PromiseLike<{ data: Person | null; error: { message: string; code?: string } | null }>
	return rpc("apply_person_choice", { p_person_id: personId, p_changes: changes as Json, p_expected: expected as Json | null })
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
 *
 * Tudo em `assignment_selection.call_person`, numa transação: trava as linhas da edição,
 * confere que o militar é dela e, com `expected`, que ainda está como a tela viu.
 */
export const callPersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ editionId: z.uuid(), personId: z.number().int(), expected: expectedSchema.optional() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAccess()
		const supabase = getAssignmentServerClient()
		// `call_person` (migration 20261011130000) ainda não está nos tipos gerados; o cast
		// some depois do `db:types`.
		const rpc = supabase.rpc.bind(supabase) as unknown as (
			fn: "call_person",
			args: CallPersonRpcArgs
		) => PromiseLike<{ data: Person | null; error: { message: string; code?: string } | null }>
		const { error } = await rpc("call_person", callPersonRpcArgs(data))
		if (error) throw new Error(conductErrorMessage(error))
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
