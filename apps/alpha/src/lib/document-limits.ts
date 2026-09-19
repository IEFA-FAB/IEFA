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
