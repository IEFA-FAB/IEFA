/**
 * @module expense-execution
 * Utilitários puros compartilhados entre as server functions e as telas da execução da despesa
 * (contratação de origem, NE com itens, registro rápido). Sem acesso a banco: testável e seguro
 * para o bundle do navegador.
 */

import { parseSheetNumber } from "@iefa/sisub-domain/opening-balance"
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

export type MoneyParse = { ok: true; value: number | null } | { ok: false; reason: string }

/**
 * Valor digitado em pt-BR: "1.234,56", "1234,56", "R$ 1.234,56" e também "1234.56". Vazio é
 * `null` (campo opcional). Reusa `parseSheetNumber` (a mesma regra da planilha de saldo de
 * abertura): "1.500", sem vírgula, é ambíguo entre milhar e decimal e volta com a instrução, em
 * vez de virar 1,5 ou 1500 em silêncio. Negativo é recusado.
 */
export function parseMoneyInput(raw: string): MoneyParse {
	const cleaned = raw.replace(/R\$/i, "").trim()
	if (cleaned === "") return { ok: true, value: null }
	const parsed = parseSheetNumber(cleaned)
	if (!parsed.ok) return { ok: false, reason: parsed.reason }
	if (parsed.value < 0) return { ok: false, reason: "o valor não pode ser negativo" }
	return { ok: true, value: Math.round(parsed.value * 10_000) / 10_000 }
}

export type EmpenhoCancellationPlan = { ok: true; valor: number } | { ok: false; message: string }

/**
 * Anulação total da NE: cancela o valor VIGENTE (lido sob o lock do evento, na transação que
 * grava). NE já anulada, ou com liquidação, não se anula inteira — o que foi liquidado não se
 * desfaz por anulação, e a recusa diz o que fazer.
 */
export function planEmpenhoCancellation(input: {
	numero: string
	status: string
	vigente: number
	liquidado: number
	aLiquidar: number
}): EmpenhoCancellationPlan {
	if (input.status === "anulado") return { ok: false, message: `O empenho ${input.numero} já está anulado` }
	if (input.liquidado > 0.009) {
		return {
			ok: false,
			message: `O empenho ${input.numero} já tem ${BRL.format(input.liquidado)} liquidados e não se anula inteiro. Anule só o saldo a liquidar (${BRL.format(Math.max(0, input.aLiquidar))}) em Empenhos → Anulação.`,
		}
	}
	return { ok: true, valor: Math.max(0, Math.round(input.vigente * 100) / 100) }
}

/** Só dígitos; CNPJ (14) ou CPF (11), senão null. */
export function normalizeDocument(value: string | null | undefined): string | null {
	if (!value) return null
	const digits = value.replace(/\D/g, "")
	return digits.length === 14 || digits.length === 11 ? digits : null
}
