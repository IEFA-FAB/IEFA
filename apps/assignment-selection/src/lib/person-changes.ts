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
