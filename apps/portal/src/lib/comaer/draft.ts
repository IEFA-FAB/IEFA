/**
 * @module comaer/draft
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

import { DocumentPayloadSchema, fromPayload, toPayload } from "./schema"
import type { DocumentInput } from "./types"

/**
 * A versão faz parte da chave porque o formato do rascunho é o `DocumentPayload`, e ele
 * muda quando os campos mudam. Sem trocar a chave, o rascunho gravado pela versão anterior
 * volta com `localidade`/`especie`, o campo novo chega `undefined` e a tela morre em
 * "Cannot read properties of undefined (reading 'trim')" no primeiro `city.trim()`.
 */
export const DRAFT_KEY = "iefa.comaer.draft.v2"

/**
 * Rascunho de um documento JÁ SALVO.
 *
 * O documento novo tinha rede; o salvo não tinha nenhuma — vinte minutos de reescrita
 * viviam só em memória, e um F5 devolvia a versão do banco sem avisar. Agora cada
 * documento salvo tem a sua chave.
 */
export function documentDraftKey(documentId: string): string {
	return `${DRAFT_KEY}:${documentId}`
}

/** Chaves de formatos anteriores: são apagadas na primeira leitura, não migradas. */
const LEGACY_DRAFT_KEYS = ["iefa.comaer.rascunho.v1"]

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

/**
 * O rascunho é VALIDADO, não assumido: o que está no `localStorage` foi escrito por outra
 * sessão e possivelmente por outra versão do formato. Um `as DocumentInput` cru transforma
 * qualquer divergência de formato em erro de runtime com a tela em branco, longe da causa.
 * Rascunho ilegível é descartado — recomeçar em branco é ruim, quebrar é pior.
 *
 * A data volta a ser `Date` no caminho: em ISO ela quebraria `dateInFull`.
 */
export function loadDraft(key: string = DRAFT_KEY): DocumentInput | null {
	if (typeof localStorage === "undefined") return null
	for (const legacy of LEGACY_DRAFT_KEYS) localStorage.removeItem(legacy)
	const stored = localStorage.getItem(key)
	if (!stored) return null
	try {
		const parsed = DocumentPayloadSchema.safeParse(JSON.parse(stored))
		if (!parsed.success) {
			localStorage.removeItem(key)
			return null
		}
		return fromPayload(parsed.data)
	} catch {
		localStorage.removeItem(key)
		return null
	}
}

export function saveDraft(input: DocumentInput, key: string = DRAFT_KEY): void {
	if (typeof localStorage === "undefined") return
	try {
		localStorage.setItem(key, JSON.stringify(toPayload(input)))
	} catch {
		// Rascunho é melhor esforço: cota estourada ou documento em estado intermediário não
		// podem derrubar a digitação em curso.
	}
}

export function clearDraft(key: string = DRAFT_KEY): void {
	if (typeof localStorage === "undefined") return
	localStorage.removeItem(key)
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

/**
 * O documento em edição difere do que está gravado?
 *
 * Comparar o payload serializado é o suficiente e é honesto: é exatamente o que seria
 * gravado. Sem isto não há como dizer "alterações não salvas", e a pessoa fecha a aba
 * achando que salvou.
 */
export function isDirty(current: DocumentInput, saved: DocumentInput | null): boolean {
	if (!saved) return false
	try {
		return JSON.stringify(toPayload(current)) !== JSON.stringify(toPayload(saved))
	} catch {
		return true
	}
}
