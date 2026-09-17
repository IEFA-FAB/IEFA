/**
 * CNPJ — inclusive o **alfanumérico**, que a Receita passou a emitir em 2026
 * (NT Conjunta 2025.001 para a NF-e).
 *
 * O formato novo é `[A-Z0-9]{12}` + 2 dígitos verificadores. O cálculo do DV
 * continua sendo módulo 11 com os mesmos pesos; o que muda é o valor de cada
 * caractere: `código ASCII − 48`, o que mantém `0`-`9` valendo 0-9 e dá 17-42
 * para `A`-`Z`. Validar com `/^\d{14}$/` recusa fornecedor novo — foi por isso
 * que este módulo existe em vez de um regex solto por aí.
 */

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const

/** Remove máscara e normaliza para maiúsculas. */
export function normalizeCnpj(raw: string | null | undefined): string | null {
	if (raw == null) return null
	const value = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
	return value.length === 14 ? value : null
}

function charValue(char: string): number {
	return char.charCodeAt(0) - 48
}

function checkDigit(base: string, weights: readonly number[]): number {
	let sum = 0
	for (let i = 0; i < weights.length; i++) {
		sum += charValue(base[i] as string) * (weights[i] as number)
	}
	const remainder = sum % 11
	return remainder < 2 ? 0 : 11 - remainder
}

/**
 * Valida CNPJ numérico ou alfanumérico. Recusa também os 14 caracteres
 * repetidos (`00000000000000`), que fecham o DV mas não existem.
 */
export function isValidCnpj(raw: string | null | undefined): boolean {
	const value = normalizeCnpj(raw)
	if (value == null) return false
	if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value)) return false
	if (/^(.)\1{13}$/.test(value)) return false

	const base = value.slice(0, 12)
	const first = checkDigit(base, FIRST_WEIGHTS)
	if (first !== charValue(value[12] as string)) return false
	const second = checkDigit(base + String(first), SECOND_WEIGHTS)
	return second === charValue(value[13] as string)
}

/** Raiz do CNPJ (8 primeiros caracteres) — identifica a matriz. */
export function cnpjRoot(raw: string | null | undefined): string | null {
	const value = normalizeCnpj(raw)
	return value == null ? null : value.slice(0, 8)
}

/** Formata para exibição: `00.394.429/0001-70`. */
export function formatCnpj(raw: string | null | undefined): string | null {
	const value = normalizeCnpj(raw)
	if (value == null) return null
	return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`
}

/** CPF (produtor rural emitente): 11 dígitos com módulo 11. */
export function isValidCpf(raw: string | null | undefined): boolean {
	if (raw == null) return false
	const value = raw.replace(/\D/g, "")
	if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false
	for (const [length, position] of [
		[9, 9],
		[10, 10],
	] as const) {
		let sum = 0
		for (let i = 0; i < length; i++) {
			sum += Number(value[i]) * (length + 1 - i)
		}
		const remainder = (sum * 10) % 11
		const digit = remainder === 10 ? 0 : remainder
		if (digit !== Number(value[position])) return false
	}
	return true
}
