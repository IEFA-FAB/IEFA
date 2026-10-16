/**
 * Leitura do saldo das planilhas do Tesouro Gerencial, compartilhada pelo monitoramento
 * e pela conta genérica (antes cada um tinha a sua cópia, com defeitos diferentes).
 */

/** Só pontos de milhar, em grupos de três dígitos: "1.234", "12.345.678". */
const THOUSANDS_ONLY = /^-?\d{1,3}(\.\d{3})+$/

/**
 * Saldo do relatório: número passa direto; texto no formato brasileiro.
 *
 * - "R$" e espaços saem: "R$ 1.234,56" → 1234.56; "-R$ 10,00" → -10.
 * - Com vírgula, a vírgula é o decimal e todo ponto é milhar: "1.234,56" → 1234.56.
 * - Sem vírgula, ponto só é milhar no padrão de milhar (grupos de três): "1.234" → 1234,
 *   "12.345.678" → 12345678. Com outro agrupamento, é decimal: "1500.25" → 1500.25.
 *   O monitoramento lia "1.234" como 1,234; a conta genérica lia "1500.25" como 150025.
 * - Parênteses são negativo, como a contabilidade escreve: "(1.234,56)" → -1234.56.
 *   Os dois devolviam NaN, e a linha sumia.
 *
 * O que não é número sai `NaN`; quem chama decide descartar a linha.
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
	if (cleaned.includes(",")) return sign * Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."))
	if (THOUSANDS_ONLY.test(cleaned)) return sign * Number.parseFloat(cleaned.replace(/\./g, ""))
	return sign * Number.parseFloat(cleaned)
}
