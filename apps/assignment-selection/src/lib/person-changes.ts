import type { Person } from "@iefa/database/assignment-selection"

/**
 * Separa a alteração de um militar em duas partes:
 *
 * - **choice**: `localidade`, `estado`, `hide_card` — a escolha. Vai pela função
 *   `assignment_selection.apply_person_choice`, que trava o militar e confere se a OM
 *   pertence ao quadro da edição, numa transação. Não há teto de vagas: a escolha é
 *   preenchida antes do evento e pode mudar na hora (`20261011120000`).
 * - **rest**: o resto (classificação, nome, flags de telão) — update comum.
 *
 * Um update direto de `localidade`/`hide_card` pularia a checagem de OM da edição.
 */
export const CHOICE_KEYS = ["localidade", "estado", "hide_card"] as const

type ChoiceKey = (typeof CHOICE_KEYS)[number]

export function splitPersonChanges<T extends Record<string, unknown>>(changes: T) {
	const choice: Partial<Pick<T, Extract<keyof T, ChoiceKey>>> = {}
	const rest: Partial<Omit<T, ChoiceKey>> = {}
	for (const [key, value] of Object.entries(changes)) {
		if (value === undefined) continue
		const target = (CHOICE_KEYS as readonly string[]).includes(key) ? choice : rest
		;(target as Record<string, unknown>)[key] = value
	}
	return {
		choice,
		rest,
		hasChoice: Object.keys(choice).length > 0,
		hasRest: Object.keys(rest).length > 0,
	}
}

/**
 * O que a tela viu do militar quando o operador agiu: as flags de telão e a OM.
 *
 * Vai junto de toda escrita da condução (chamar, revelar, confirmar, desfazer, trocar a
 * OM) e o servidor só grava se a linha ainda estiver assim, na mesma instrução (update
 * condicional) ou na mesma transação (`apply_person_choice` com `p_expected`). Sem isso,
 * com dois controles abertos, a tela que ficou para trás sobrescreve o passo do outro.
 */
export const EXPECTED_KEYS = ["localidade", "show_card", "show_om", "hide_card"] as const

export type ExpectedState = Partial<Pick<Person, (typeof EXPECTED_KEYS)[number]>>

export function expectedState(person: Pick<Person, (typeof EXPECTED_KEYS)[number]>): Required<ExpectedState> {
	return { localidade: person.localidade, show_card: person.show_card, show_om: person.show_om, hide_card: person.hide_card }
}

/**
 * Correção manual (tabela de flags): confere só as flags que a escrita muda, com o valor
 * que a caixa mostrava. Nome e classificação não entram: não são estado do telão.
 */
export function expectedForChanges(person: Pick<Person, "show_card" | "show_om" | "hide_card">, changes: Record<string, unknown>): ExpectedState | undefined {
	const expected: ExpectedState = {}
	for (const key of ["show_card", "show_om", "hide_card"] as const) {
		if (changes[key] !== undefined) expected[key] = person[key]
	}
	return Object.keys(expected).length > 0 ? expected : undefined
}

export const STALE_SCREEN_MESSAGE = "O telão mudou em outro controle; a tela foi atualizada."

/**
 * Filtros PostgREST que conferem o estado esperado. `eq` não casa NULL (`localidade` sem
 * OM): esse caso vira `is null`.
 */
export function expectedFilters(expected: ExpectedState): { column: keyof ExpectedState; op: "eq" | "is"; value: string | boolean | null }[] {
	return EXPECTED_KEYS.filter((key) => expected[key] !== undefined).map((key) => {
		const value = expected[key] as string | boolean | null
		return { column: key, op: value === null ? "is" : "eq", value }
	})
}
