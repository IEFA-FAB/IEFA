/**
 * @module comaer/rascunho
 * Rascunho do documento em `localStorage`.
 *
 * Sem isso, um F5 no meio da redação apaga o ofício inteiro. O papel deste módulo é o do
 * documento EM EDIÇÃO; o que o usuário decide salvar vai para o schema `documents`
 * (`@/server/documents.fn`). Os dois convivem porque respondem a coisas diferentes:
 * sobreviver ao recarregar a página × existir depois de trocar de máquina.
 *
 * Continua sendo local ao navegador de propósito: o conteúdo pode ser sigiloso
 * (art. 7º § 2º) e não há motivo para subi-lo antes de o usuário pedir.
 */

import type { DocumentoInput } from "./tipos"

export const CHAVE_RASCUNHO = "iefa.comaer.rascunho.v1"

export function rascunhoInicial(): DocumentoInput {
	return {
		especie: "oficio-comaer",
		ambito: "comaer",
		sigilo: "ostensivo",
		prioridade: "rotina",
		om: { nome: "", sigla: "", setor: "", endereco: "", telefone: "", email: "" },
		numeracao: { sequencial: null, setor: "", ordemGeral: "" },
		nup: "",
		localidade: "",
		data: new Date(),
		remetente: { cargo: "", genero: "m" },
		destinatarios: [{ cargo: "", genero: "m" }],
		assunto: "",
		referencias: [],
		anexos: [],
		precedencia: "igual",
		paragrafos: [{ texto: "" }],
		signatario: { nome: "", posto: "", quadro: "", cargo: "", om: "" },
	}
}

/** A data vira ISO na serialização; sem reidratar, `dataPorExtenso` receberia string. */
export function carregarRascunho(): DocumentoInput | null {
	if (typeof localStorage === "undefined") return null
	const cru = localStorage.getItem(CHAVE_RASCUNHO)
	if (!cru) return null
	try {
		const dados = JSON.parse(cru) as DocumentoInput & { data: string }
		return { ...dados, data: new Date(dados.data) }
	} catch {
		return null
	}
}

export function salvarRascunho(input: DocumentoInput): void {
	if (typeof localStorage === "undefined") return
	localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(input))
}

export function limparRascunho(): void {
	if (typeof localStorage === "undefined") return
	localStorage.removeItem(CHAVE_RASCUNHO)
}

/** `<input type="date">` fala ISO curta; a montagem fala `Date`. */
export function paraInputDate(data: Date): string {
	const mes = String(data.getMonth() + 1).padStart(2, "0")
	const dia = String(data.getDate()).padStart(2, "0")
	return `${data.getFullYear()}-${mes}-${dia}`
}

export function deInputDate(valor: string): Date {
	// `<input type="date">` limpo devolve "" — e `new Date(NaN, -1, 1)` não é o problema:
	// com o `?? 1` de antes, o campo vazio datava o documento em 1º de janeiro de 1900 e o
	// rascunho gravava isso em silêncio. Data ausente volta a ser hoje.
	const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
	if (!partes) return new Date()
	// Pelo construtor por partes: "2026-07-03" interpretado como ISO viraria UTC e voltaria
	// como dia 2 no Brasil.
	return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
}
