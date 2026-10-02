/**
 * @module civil-date
 * Data civil de Brasília (`YYYY-MM-DD`): o "hoje" de cardápio, vencimento, empenho e competência.
 *
 * O servidor e o banco rodam em UTC. Entre 21h e a meia-noite de Brasília, `new Date()` já está
 * no dia seguinte, e `new Date().toISOString().slice(0, 10)` devolve AMANHÃ: o cardápio "de hoje"
 * do MCP saía o de amanhã, e o lote recebido às 22h ganhava código do dia seguinte. Todo "hoje"
 * do sisub sai daqui. Sem dependência de banco: seguro para o bundle do navegador.
 *
 * Aritmética de data civil é feita ao MEIO-DIA UTC, longe da virada: somar dias a uma string
 * `YYYY-MM-DD` nunca muda de dia por fuso.
 */

export const BRASILIA_TIME_ZONE = "America/Sao_Paulo"

// `en-CA` é o locale cujo formato numérico curto já é ISO (`YYYY-MM-DD`).
const CIVIL_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: BRASILIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Data civil de hoje em Brasília. */
export function brasiliaToday(now: Date = new Date()): string {
	return CIVIL_DATE_FORMAT.format(now)
}

/** Competência corrente em Brasília (`YYYY-MM`). */
export function brasiliaCurrentMonth(now: Date = new Date()): string {
	return brasiliaToday(now).slice(0, 7)
}

/**
 * Data civil de Brasília de um instante (timestamptz do banco, `Date`). Data já civil
 * (`YYYY-MM-DD`) volta como veio; instante ilegível devolve `null`.
 */
export function brasiliaCivilDateOf(instant: string | Date): string | null {
	if (typeof instant === "string" && CIVIL_DATE_RE.test(instant)) return instant
	const date = typeof instant === "string" ? new Date(instant) : instant
	return Number.isNaN(date.getTime()) ? null : CIVIL_DATE_FORMAT.format(date)
}

/** `YYYY-MM-DD` somado de `days` dias (negativo subtrai). */
export function addCivilDays(civilDate: string, days: number): string {
	const date = new Date(`${civilDate}T12:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

/**
 * `YYYY-MM-DD` somado de `months` meses, com a mesma rolagem do `Date` (31/03 − 1 mês = 03/03).
 */
export function addCivilMonths(civilDate: string, months: number): string {
	const date = new Date(`${civilDate}T12:00:00Z`)
	date.setUTCMonth(date.getUTCMonth() + months)
	return date.toISOString().slice(0, 10)
}

/** Primeiro e último dia do mês de uma data civil. */
export function civilMonthBounds(civilDate: string): { start: string; end: string } {
	const start = `${civilDate.slice(0, 7)}-01`
	return { start, end: addCivilDays(addCivilMonths(start, 1), -1) }
}
