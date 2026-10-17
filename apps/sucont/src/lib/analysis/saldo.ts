/**
 * Leitura do saldo das planilhas, compartilhada pelas ferramentas do sucont (monitoramento,
 * conta genérica, compatibilidade, subitens, cruzamento, saldo alongado e auditor). Antes
 * cada uma tinha a sua cópia, com defeitos diferentes.
 *
 * O texto que chega aqui é sempre o DIGITADO, na convenção brasileira: as ferramentas leem
 * o xlsx com `raw: true` (célula numérica chega como número e passa direto) e o CSV sem
 * deixar o SheetJS adivinhar número (`XLSX.read` com `raw: true`, ou o Papa). Texto que o
 * SheetJS FORMATA (`raw: false`) sai em inglês ("123.456" é cento e vinte e três), e não
 * deve chegar a este parser: lido como brasileiro, viraria um valor mil vezes maior.
 */

/** Milhar com ponto, em grupos de três dígitos: "1.234", "12.345.678". O primeiro grupo não começa por zero. */
const THOUSANDS_WITH_DOT = /^[1-9]\d{0,2}(\.\d{3})+$/

/** Formato brasileiro completo: milhar com ponto (opcional) e decimal com vírgula. */
const BRAZILIAN_FULL = /^\d{1,3}(\.\d{3})*,\d*$|^\d+,\d*$/

/** Formato inglês completo ("1,234.56"): com os dois separadores e a vírgula antes, não há outra leitura. */
const ENGLISH_FULL = /^\d{1,3}(,\d{3})+\.\d*$/

/**
 * Tira o sinal do texto (sem "R$" nem espaço). Negativo é qualquer uma das marcas, e
 * elas não se cancelam: "-(1.234,56)" é negativo, como a planilha quis dizer.
 * - "-" ou "+" na frente: "-1.234", "+1.234";
 * - parênteses em volta, como a contabilidade escreve: "(1.234,56)", "-(1.234,56)";
 * - "-" no fim, como sai em relatório contábil: "1.234-".
 */
function splitSign(text: string): { negative: boolean; body: string } {
	let body = text
	let negative = false
	const hasLeadingSign = /^[+-]/.test(body)
	if (hasLeadingSign) {
		negative = body.startsWith("-")
		body = body.slice(1)
	}
	if (body.startsWith("(") && body.endsWith(")")) {
		negative = true
		body = body.slice(1, -1)
		if (!hasLeadingSign && /^[+-]/.test(body)) body = body.slice(1)
	} else if (!hasLeadingSign && body.endsWith("-")) {
		negative = true
		body = body.slice(0, -1)
	}
	return { negative, body }
}

/** O corpo do número (só dígitos e separadores) com o decimal como ponto, ou `null` se não for número. */
function normalizeBody(body: string): string | null {
	if (!/^[\d.,]*\d[\d.,]*$/.test(body)) return null
	const hasComma = body.includes(",")
	const hasDot = body.includes(".")
	if (hasComma) {
		// Vírgula é SEMPRE decimal em pt-BR: "12,345" é doze vírgula três quatro cinco.
		if (BRAZILIAN_FULL.test(body)) return body.replace(/\./g, "").replace(",", ".")
		if (hasDot && ENGLISH_FULL.test(body)) return body.replace(/,/g, "")
		return null
	}
	// Ponto sozinho: milhar só no padrão de milhar ("1.234", "1.234.567"); fora dele é o
	// decimal ("1500.25", "0.500"), e mais de um ponto fora do padrão não é número.
	if (hasDot && THOUSANDS_WITH_DOT.test(body)) return body.replace(/\./g, "")
	return body
}

/**
 * Saldo da célula: número passa direto; texto na convenção brasileira.
 *
 * - "R$" e espaços saem: "R$ 1.234,56" → 1234.56; "-R$ 10,00" → -10.
 * - Vírgula é sempre o decimal: "1.234,56" → 1234.56; "12,345" → 12.345; "1,5" → 1.5.
 * - Ponto sozinho é milhar no padrão de milhar e decimal fora dele: "1.234" → 1234,
 *   "1.234.567" → 1234567, "1500.25" → 1500.25, "0.500" → 0.5.
 * - "1,234.56" (os dois, vírgula antes) só tem uma leitura: 1234.56.
 * - Sinal na frente, no fim ou em parênteses: "+1.234" → 1234, "1.234-" → -1234,
 *   "(1.234,56)" e "-(1.234,56)" → -1234.56.
 *
 * O que não é número, ou é número em formato ambíguo ("1,234,567", "1.23.4", "12abc"),
 * sai `NaN`; quem chama decide descartar a linha ou contar 0.
 */
export function parseBrazilianAmount(raw: unknown): number {
	if (typeof raw === "number") return raw
	if (typeof raw !== "string") return Number.NaN
	const cleaned = raw.replace(/R?\$|\s/g, "").replace(/−/g, "-")
	const { negative, body } = splitSign(cleaned)
	const normalized = normalizeBody(body)
	if (normalized === null) return Number.NaN
	const value = Number(normalized)
	return negative && value !== 0 ? -value : value
}

/** Como `parseBrazilianAmount`, mas o que não é número conta 0 (as ferramentas que somam sem descartar a linha). */
export function parseBrazilianAmountOrZero(raw: unknown): number {
	const value = parseBrazilianAmount(raw)
	return Number.isNaN(value) ? 0 : value
}
