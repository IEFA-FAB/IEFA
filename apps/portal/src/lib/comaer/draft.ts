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

import type { DocumentInput } from "./types"

export const DRAFT_KEY = "iefa.comaer.rascunho.v1"

export function newDocument(): DocumentInput {
	return {
		kind: "oficio-comaer",
		scope: "comaer",
		classification: "ostensivo",
		priority: "rotina",
		om: { name: "", acronym: "", sector: "", address: "", phone: "", email: "" },
		numbering: { sequence: null, sector: "", organizationNumber: "" },
		nup: "",
		city: "",
		date: new Date(),
		sender: { position: "", gender: "m" },
		recipients: [{ position: "", gender: "m" }],
		subject: "",
		references: [],
		annexes: [],
		precedence: "igual",
		paragraphs: [{ text: "" }],
		signer: { name: "", rank: "", quadro: "", position: "", om: "" },
	}
}

/** A data vira ISO na serialização; sem reidratar, `dataPorExtenso` receberia string. */
export function loadDraft(): DocumentInput | null {
	if (typeof localStorage === "undefined") return null
	const stored = localStorage.getItem(DRAFT_KEY)
	if (!stored) return null
	try {
		const parsed = JSON.parse(stored) as DocumentInput & { date: string }
		return { ...parsed, date: new Date(parsed.date) }
	} catch {
		return null
	}
}

export function saveDraft(input: DocumentInput): void {
	if (typeof localStorage === "undefined") return
	localStorage.setItem(DRAFT_KEY, JSON.stringify(input))
}

export function clearDraft(): void {
	if (typeof localStorage === "undefined") return
	localStorage.removeItem(DRAFT_KEY)
}

/** `<input type="date">` fala ISO curta; a montagem fala `Date`. */
export function toDateInputValue(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}

export function fromDateInputValue(value: string): Date {
	// `<input type="date">` limpo devolve "" — e `new Date(NaN, -1, 1)` não é o problema:
	// com o `?? 1` de antes, o campo vazio datava o documento em 1º de janeiro de 1900 e o
	// rascunho gravava isso em silêncio. Data ausente volta a ser hoje.
	const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (!parts) return new Date()
	// Pelo construtor por partes: "2026-07-03" interpretado como ISO viraria UTC e voltaria
	// como dia 2 no Brasil.
	return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
}
