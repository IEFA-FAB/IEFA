/**
 * Ciclo do calendário de contratação (Decreto 10.947/2022, art. 11, III) de uma contratação.
 *
 * `planned_month` não tem ano: o ciclo se calcula a partir de hoje.
 *
 * - vencimento = o primeiro dia 1 do mês previsto (no ano anterior, no corrente ou no seguinte)
 *   cuja carência de 2 meses ainda não acabou: dezembro continua sendo o ciclo corrente em
 *   janeiro e fevereiro, e a janela que cruza o ano (março com 5 meses de antecedência começa
 *   em outubro) sai da mesma conta;
 * - início da janela = vencimento − antecedência;
 * - a pendência "planejar a contratação" fica ativa do início da janela até vencimento + 2 meses;
 * - ela se encerra quando existe anexo concluído da contratação depois do início da janela.
 *
 * Datas em "YYYY-MM-DD", no calendário (sem fuso): quem chama passa o "hoje" de Brasília.
 */

const GRACE_MONTHS = 2

export interface CalendarCycle {
	/** Dia 1 do mês previsto, no ciclo corrente. */
	due: string
	windowStart: string
	windowEnd: string
	/** Hoje está dentro da janela do ciclo. */
	active: boolean
	/** Há anexo concluído da contratação dentro deste ciclo. */
	closed: boolean
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
	const index = year * 12 + (month - 1) + delta
	return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

const iso = (year: number, month: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`

export function computeContractingCycle(
	plannedMonth: number | null,
	leadTimeMonths: number,
	today: string,
	concludedAt: readonly string[] = []
): CalendarCycle | null {
	if (plannedMonth == null || plannedMonth < 1 || plannedMonth > 12) return null
	const [year, month] = today.split("-").map(Number) as [number, number]
	const todayMonth = iso(year, month)
	// O ciclo corrente é o primeiro vencimento cuja carência ainda não acabou.
	let due = { year: year + 1, month: plannedMonth }
	for (const candidate of [year - 1, year, year + 1]) {
		const graceEnd = addMonths(candidate, plannedMonth, GRACE_MONTHS)
		if (iso(graceEnd.year, graceEnd.month) >= todayMonth) {
			due = { year: candidate, month: plannedMonth }
			break
		}
	}

	const start = addMonths(due.year, due.month, -leadTimeMonths)
	const end = addMonths(due.year, due.month, GRACE_MONTHS)
	const windowStart = iso(start.year, start.month)
	const windowEnd = iso(end.year, end.month)
	return {
		due: iso(due.year, due.month),
		windowStart,
		windowEnd,
		active: todayMonth >= windowStart && todayMonth <= windowEnd,
		closed: concludedAt.some((date) => date.slice(0, 10) >= windowStart),
	}
}
