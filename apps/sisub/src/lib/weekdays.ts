/**
 * Dias da semana na convenção ISO (1 = segunda … 7 = domingo): a do `day_of_week` dos templates
 * semanais e a do `startDayOfWeek` do `applyTemplate`. Fonte única dos rótulos, para a grade do
 * template, a folha impressa, o diálogo de aplicar template e o cartão de aprovação do chat
 * escreverem o mesmo dia do mesmo jeito.
 */
export const WEEKDAYS = [
	{ num: 1, label: "Segunda-feira", abbr: "Seg" },
	{ num: 2, label: "Terça-feira", abbr: "Ter" },
	{ num: 3, label: "Quarta-feira", abbr: "Qua" },
	{ num: 4, label: "Quinta-feira", abbr: "Qui" },
	{ num: 5, label: "Sexta-feira", abbr: "Sex" },
	{ num: 6, label: "Sábado", abbr: "Sáb" },
	{ num: 7, label: "Domingo", abbr: "Dom" },
] as const

/**
 * Faixas da semana com efetivo próprio — as mesmas que a previsão de comensais pinta de cores
 * diferentes (`DayCard`): de segunda a quinta o efetivo é o pleno, na sexta cai (expediente
 * curto, dispensas) e no fim de semana fica a escala. O auxiliador de quantitativos do cardápio
 * semanal pede um número por faixa.
 */
export const WEEKDAY_GROUPS = [
	{ key: "mon-thu", label: "Seg a Qui", days: [1, 2, 3, 4] },
	{ key: "fri", label: "Sexta", days: [5] },
	{ key: "weekend", label: "Fim de semana", days: [6, 7] },
] as const

export type WeekdayGroup = (typeof WEEKDAY_GROUPS)[number]

/** Faixa do dia ISO (1–7); fora da faixa cai em seg–qui. */
export function weekdayGroupOf(isoDay: number): WeekdayGroup["key"] {
	return WEEKDAY_GROUPS.find((group) => (group.days as readonly number[]).includes(isoDay))?.key ?? "mon-thu"
}

/** Rótulo do dia ISO (1–7), `undefined` fora da faixa. */
export function getWeekdayLabel(day: number): string | undefined {
	return WEEKDAYS.find((weekday) => weekday.num === day)?.label
}
