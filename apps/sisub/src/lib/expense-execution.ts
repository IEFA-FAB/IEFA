/**
 * @module expense-execution
 * Utilitários puros compartilhados entre as server functions e as telas da execução da despesa
 * (contratação de origem, NE com itens, registro rápido). Sem acesso a banco: testável e seguro
 * para o bundle do navegador.
 */

/** Data civil de hoje em Brasília ("YYYY-MM-DD"). O servidor roda em UTC. */
export function todayInBrasilia(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** Exercício corrente em Brasília. */
export function currentFiscalYear(now: Date = new Date()): number {
	return Number(todayInBrasilia(now).slice(0, 4))
}

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** "2026-09-01" → "01/09/2026"; vazio → "—". */
export function formatIsoDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const [year, month, day] = iso.slice(0, 10).split("-")
	return `${day}/${month}/${year}`
}

/** Só dígitos; CNPJ (14) ou CPF (11), senão null. */
export function normalizeDocument(value: string | null | undefined): string | null {
	if (!value) return null
	const digits = value.replace(/\D/g, "")
	return digits.length === 14 || digits.length === 11 ? digits : null
}
