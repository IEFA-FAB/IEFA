/**
 * Separa a alteração de um militar em duas partes:
 *
 * - **choice**: `localidade`, `estado`, `hide_card` — o que consome vaga. Vai pela
 *   função `assignment_selection.apply_person_choice`, que trava a vaga e confere o
 *   teto (`total_vagas`) e se a OM pertence à edição, tudo numa transação.
 * - **rest**: o resto (classificação, nome, flags de telão) — update comum.
 *
 * Um update direto de `localidade`/`hide_card` pula o teto: foi assim que uma OM podia
 * terminar com mais confirmados do que vagas.
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
