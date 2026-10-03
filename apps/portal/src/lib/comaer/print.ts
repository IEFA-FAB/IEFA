/**
 * @module comaer/print
 * Regras de página da impressão que dependem do documento.
 *
 * O `<style>` do editor é texto montado em tempo de render; o que vem do documento entra numa
 * string CSS e por isso passa por `cssString`, que também escapa `<` e `>` para o conteúdo não
 * fechar a tag `<style>` no HTML do servidor.
 */

/**
 * Literal de string CSS, seguro dentro de `<style>`: `<` e `>` viram escape hexadecimal do CSS
 * (o HTML não vê `</style>`, e a folha impressa mostra o caractere de volta); quebra de linha
 * vira espaço.
 */
export function cssString(value: string): string {
	const escaped = value
		.replace(/[\\"]/g, "\\$&")
		.replace(/</g, "\\3C ")
		.replace(/>/g, "\\3E ")
		.replace(/[\r\n]+/g, " ")
	return `"${escaped}"`
}

/**
 * Art. 42 § 1º — "(Fl 2/3 do Ofício nº … - IEFA, de 02 OUT 2026, Prot nº …)" no alto de cada
 * folha suplementar, nunca na primeira. Usa as caixas de margem do `@page` (Chromium 131+);
 * navegador sem suporte ignora a regra e imprime como antes, sem a linha.
 *
 * Caixa central e 10 pt, o corpo das notas (art. 20, II, c): a caixa de margem do Chromium não
 * passa de uma fração da largura, e em 12 pt a identificação quebrava em duas linhas.
 */
export function continuationPageRule(label: string): string {
	return `@page { @top-center { content: "(Fl " counter(page) "/" counter(pages) " do " ${cssString(label)} ")"; vertical-align: bottom; font: 10pt Calibri, Carlito, sans-serif; } }
					@page :first { @top-center { content: none; } }`
}
