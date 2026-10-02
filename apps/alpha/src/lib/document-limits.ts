/**
 * Documento que excede um teto de processamento (páginas de PDF, tamanho descompactado ou
 * parágrafos de docx). A mensagem é escrita por nós e não carrega nada do ambiente — é a
 * única mensagem de erro de extração que pode ir inteira ao cliente, e tem de ir: sem ela,
 * quem enviou um edital de 600 páginas recebe "falha na extração" e nunca sabe o porquê.
 */
export class DocumentLimitError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "DocumentLimitError"
	}
}

/**
 * Teto de páginas de PDF lidas por padrão.
 *
 * O pdf.js monta o texto página a página, e o custo cresce com elas: sem teto, um PDF
 * enviado com milhares de páginas (vazias, que comprimem a quase nada) prende o processo
 * por minutos. Um ETP/TR/edital real fica muito abaixo disso. Quem lê PDF de origem
 * confiável e maior (o coletor do RADA-e) passa o teto explicitamente.
 */
export const MAX_PDF_PAGES = 500

export class PdfTooLargeError extends DocumentLimitError {
	readonly pages: number
	constructor(pages: number, maxPages: number) {
		super(`O PDF tem ${pages} páginas; o limite é ${maxPages}.`)
		this.name = "PdfTooLargeError"
		this.pages = pages
	}
}
