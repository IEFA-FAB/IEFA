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

/** Rótulo do dia ISO (1–7), `undefined` fora da faixa. */
export function getWeekdayLabel(day: number): string | undefined {
	return WEEKDAYS.find((weekday) => weekday.num === day)?.label
}
