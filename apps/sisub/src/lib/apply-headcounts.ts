import { MAX_EVENT_MEAL_HEADCOUNT } from "@iefa/sisub-domain/schemas"

/**
 * Efetivo informado ao aplicar um cardápio ao calendário (D6 da mudança
 * `sisub-menu-composition-relative-quantities`).
 *
 * - Semanal: um número por tipo de refeição, o mesmo para todos os dias aplicados. Campo vazio
 *   usa o efetivo do cardápio (por dia e refeição); no modelo global, que não tem efetivo, vazio
 *   é "a definir".
 * - Evento e apoio: um número por refeição própria (kits, no apoio), vindo preenchido com o do
 *   cardápio. Vazio é "a definir".
 *
 * Sem efetivo a aplicação passa: o dia fica com a pendência "efetivo a definir" e informar o
 * número depois calcula as porções.
 */

/** Campo vazio = `null`; inteiro positivo dentro do teto = número; o resto é inválido. */
export function parseHeadcountInput(raw: string): number | null | "invalid" {
	const text = raw.trim()
	if (text === "") return null
	if (!/^\d+$/.test(text)) return "invalid"
	const value = Number.parseInt(text, 10)
	return value >= 1 && value <= MAX_EVENT_MEAL_HEADCOUNT ? value : "invalid"
}

export type HeadcountRow = {
	/** `mealTypeId` no semanal, `occasionMealId` no evento e no apoio. */
	id: string
	label: string
	/** Efetivo do cardápio para esta linha, para o texto de ajuda; `null` = o cardápio não tem. */
	templateHint: string | null
}

type WeeklyTemplateLike = {
	items: readonly { meal_type_id: string | null; recipe_id: string | null; meal_type?: { name: string | null; sort_order: number | null } | null }[]
	meals: readonly { meal_type_id: string; base_headcount: number | null }[]
}

/**
 * Uma linha por tipo de refeição que o semanal põe no calendário (item sem preparação não é
 * aplicado). A ajuda mostra o efetivo do cardápio: um número, ou a faixa quando varia por dia.
 */
export function weeklyHeadcountRows(template: WeeklyTemplateLike): HeadcountRow[] {
	const byMealType = new Map<string, { label: string; order: number }>()
	for (const item of template.items) {
		if (!item.meal_type_id || !item.recipe_id || byMealType.has(item.meal_type_id)) continue
		byMealType.set(item.meal_type_id, { label: item.meal_type?.name || "Refeição", order: item.meal_type?.sort_order ?? Number.MAX_SAFE_INTEGER })
	}
	return [...byMealType.entries()]
		.sort(([, a], [, b]) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"))
		.map(([id, { label }]) => {
			const bases = template.meals.filter((m) => m.meal_type_id === id && m.base_headcount != null).map((m) => m.base_headcount as number)
			let templateHint: string | null = null
			if (bases.length > 0) {
				const min = Math.min(...bases)
				const max = Math.max(...bases)
				templateHint = min === max ? String(min) : `${min} a ${max}`
			}
			return { id, label, templateHint }
		})
}

/**
 * Semanal: só vai o que foi digitado — refeição ausente usa o efetivo do cardápio, e no modelo
 * global (sem efetivo) ausente já é "a definir". `undefined` quando não há nada a mandar.
 */
export function weeklyHeadcountsPayload(draft: Readonly<Record<string, string>>): { mealTypeId: string; headcount: number }[] | undefined {
	const entries = Object.entries(draft).flatMap(([mealTypeId, raw]) => {
		const value = parseHeadcountInput(raw)
		return typeof value === "number" ? [{ mealTypeId, headcount: value }] : []
	})
	return entries.length > 0 ? entries : undefined
}

type OccasionMealLike = { id: string; name: string; base_headcount: number | null }

/** Uma linha por refeição própria do evento ou apoio, na ordem do cardápio. */
export function occasionHeadcountRows(meals: readonly OccasionMealLike[]): HeadcountRow[] {
	return meals.map((m) => ({ id: m.id, label: m.name, templateHint: m.base_headcount != null ? String(m.base_headcount) : null }))
}

/** Rascunho inicial do evento ou apoio: o efetivo de cada refeição do cardápio (vazio no global). */
export function occasionHeadcountDraft(meals: readonly OccasionMealLike[], isGlobal: boolean): Record<string, string> {
	return Object.fromEntries(meals.map((m) => [m.id, !isGlobal && m.base_headcount != null ? String(m.base_headcount) : ""]))
}

/**
 * Evento e apoio: toda refeição vai, com o número do campo ou `null` (a definir). O campo já
 * nasce com o efetivo do cardápio; esvaziá-lo é dizer que ainda não se sabe.
 */
export function occasionHeadcountsPayload(
	meals: readonly OccasionMealLike[],
	draft: Readonly<Record<string, string>>
): { occasionMealId: string; headcount: number | null }[] | undefined {
	if (meals.length === 0) return undefined
	return meals.map((m) => {
		const value = parseHeadcountInput(draft[m.id] ?? "")
		return { occasionMealId: m.id, headcount: typeof value === "number" ? value : null }
	})
}

/** Algum campo com valor que não é efetivo (zero, decimal, acima do teto): o aplicar espera a correção. */
export function hasInvalidHeadcount(draft: Readonly<Record<string, string>>): boolean {
	return Object.values(draft).some((raw) => parseHeadcountInput(raw) === "invalid")
}
