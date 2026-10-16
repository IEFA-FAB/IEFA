/**
 * Peças puras das leituras de crédito (`server/budget.fn.ts`): filtro por exercício, valor
 * vigente e ordem das listas. Fora do `.fn.ts` para serem testadas sem banco.
 */

import { empenhoEventSign, roundToCents } from "@iefa/sisub-domain"

/** Ano (`YYYY`) de uma data ou competência `YYYY-MM[-DD]`; `null` se não começar por ano. */
export function yearOfDate(value: string): number | null {
	const match = /^(\d{4})-/.exec(value)
	return match ? Number(match[1]) : null
}

/**
 * Filtro PostgREST (`.or(...)`) das NE cujo exercício cai em `[minYear, maxYear]`, pela mesma
 * regra de `empenhoConsumesCreditLine`: o `exercicio` da NE e, quando ele é nulo, o ano de
 * `data_empenho`. O intervalo é um superconjunto dos anos pedidos; o recorte exato continua
 * na conta do domínio, então ano a mais no meio do intervalo só custa linhas, não muda valor.
 */
export function empenhoExercicioFilter(years: readonly number[]): string | null {
	const valid = years.filter((year) => Number.isInteger(year))
	if (valid.length === 0) return null
	const min = Math.min(...valid)
	const max = Math.max(...valid)
	return `and(exercicio.gte.${min},exercicio.lte.${max}),and(exercicio.is.null,data_empenho.gte.${min}-01-01,data_empenho.lte.${max}-12-31)`
}

/**
 * Valor vigente da NE a partir dos eventos embutidos na mesma linha: original + reforços −
 * anulações, a fórmula de `finance.v_empenho_vigente`. Lido junto com a NE, sai do mesmo
 * snapshot; a view, lida em outra requisição, podia ver um evento que a lista não viu.
 */
export function valorVigenteFromEvents(valorTotal: number, events: ReadonlyArray<{ tipo: string; valor: number }>): number {
	return roundToCents(events.reduce((total, event) => total + empenhoEventSign(event.tipo) * Number(event.valor ?? 0), Number(valorTotal)))
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

/** Ordem da tela de crédito: competência mais recente primeiro, depois ND. */
export function compareCreditLines(a: { competencia: string; nd: string }, b: { competencia: string; nd: string }): number {
	return compareText(b.competencia, a.competencia) || compareText(a.nd, b.nd)
}

/** Ordem da lista de NC: emissão mais recente primeiro, depois registro mais recente. */
export function compareCreditNotes(a: { issued_on: string; created_at: string }, b: { issued_on: string; created_at: string }): number {
	return compareText(b.issued_on, a.issued_on) || compareText(b.created_at, a.created_at)
}
