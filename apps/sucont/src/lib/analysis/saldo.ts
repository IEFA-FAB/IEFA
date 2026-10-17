/**
 * Leitura do saldo das planilhas, compartilhada pelas ferramentas do sucont (monitoramento,
 * conta genérica, compatibilidade, subitens, cruzamento, saldo alongado e auditor). Antes
 * cada uma tinha a sua cópia, com defeitos diferentes.
 */

/**
 * Separador só de milhar, em grupos de três dígitos: "1.234", "12.345.678", "1,234". O
 * primeiro grupo não começa por zero: "0.500" é meio, não quinhentos.
 */
const THOUSANDS_WITH_DOT = /^-?[1-9]\d{0,2}(\.\d{3})+$/
const THOUSANDS_WITH_COMMA = /^-?[1-9]\d{0,2}(,\d{3})+$/

/** Tira o separador de milhar e deixa o decimal como ponto, a partir do texto já limpo. */
function normalizeSeparators(cleaned: string): string {
	const lastDot = cleaned.lastIndexOf(".")
	const lastComma = cleaned.lastIndexOf(",")
	// Os dois separadores: o último é o decimal ("1.234,56" brasileiro; "1,234.56" é o que o
	// SheetJS devolve com `raw: false`, formatado em inglês).
	if (lastDot !== -1 && lastComma !== -1) {
		return lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "")
	}
	// Um só separador, no padrão de milhar: é milhar. Valor monetário não tem três casas
	// decimais, então "1.234" e "1,234" são mil duzentos e trinta e quatro.
	if (THOUSANDS_WITH_DOT.test(cleaned)) return cleaned.replace(/\./g, "")
	if (THOUSANDS_WITH_COMMA.test(cleaned)) return cleaned.replace(/,/g, "")
	// Fora do padrão de milhar, o separador é o decimal: "1500.25", "1234,5".
	return cleaned.replace(",", ".")
}

/**
 * Saldo da célula: número passa direto; texto no formato brasileiro (ou no inglês que o
 * SheetJS formata).
 *
 * - "R$" e espaços saem: "R$ 1.234,56" → 1234.56; "-R$ 10,00" → -10.
 * - Com vírgula e ponto, o último é o decimal: "1.234,56" e "1,234.56" → 1234.56.
 * - Com um só separador, ele é milhar só no padrão de milhar (grupos de três): "1.234" e
 *   "1,234" → 1234. Fora dele, é decimal: "1500.25" → 1500.25, "0.500" → 0.5.
 *   O monitoramento lia "1.234" como 1,234; a conta genérica lia "1500.25" como 150025.
 * - Parênteses são negativo, como a contabilidade escreve: "(1.234,56)" → -1234.56.
 *
 * O que não é número sai `NaN`; quem chama decide descartar a linha ou contar 0.
 */
export function parseBrazilianAmount(raw: unknown): number {
	if (typeof raw === "number") return raw
	if (typeof raw !== "string") return Number.NaN
	let cleaned = raw.replace(/[R$\s]/g, "")
	let sign = 1
	const parenthesized = /^\((.*)\)$/.exec(cleaned)
	if (parenthesized) {
		cleaned = parenthesized[1]
		sign = -1
	}
	return sign * Number.parseFloat(normalizeSeparators(cleaned))
}

/** Como `parseBrazilianAmount`, mas o que não é número conta 0 (as ferramentas que somam sem descartar a linha). */
export function parseBrazilianAmountOrZero(raw: unknown): number {
	const value = parseBrazilianAmount(raw)
	return Number.isNaN(value) ? 0 : value
}
