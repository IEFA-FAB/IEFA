import { describe, expect, it } from "vitest"
import type { FolderConference, FolderReviewStats } from "@/lib/ingredient-tree"
import { describeFolderConference, describeFolderReview, formatConferenceAuthor, formatReviewDate, isFolderFullyReviewed } from "./ingredients-tree-node-text"

// Meio-dia UTC: a data local é a mesma em qualquer fuso de -11 h a +11 h.
const ISO = "2026-06-09T12:00:00Z"
const OLDER = "2025-01-31T12:00:00Z"

const review = (over: Partial<FolderReviewStats>): FolderReviewStats => ({ total: 5, reviewed: 5, oldestReviewedAt: OLDER, ...over })
const conference = (over: Partial<FolderConference>): FolderConference => ({ reviewedAt: ISO, reviewedByName: null, addedSince: 0, ...over })

describe("formatReviewDate", () => {
	it("formata a data ISO como dd/mm/aaaa", () => {
		expect(formatReviewDate(ISO)).toBe("09/06/2026")
	})
})

describe("isFolderFullyReviewed", () => {
	it("é verdadeiro quando todos foram conferidos", () => {
		expect(isFolderFullyReviewed(review({ total: 3, reviewed: 3 }))).toBe(true)
	})
	it("é falso com conferência parcial", () => {
		expect(isFolderFullyReviewed(review({ total: 3, reviewed: 2 }))).toBe(false)
	})
})

describe("describeFolderReview", () => {
	it("tudo conferido e com data: cita o mais antigo", () => {
		expect(describeFolderReview(review({ total: 4, reviewed: 4 }))).toBe("Todos os 4 insumos conferidos. O mais antigo em 31/01/2025.")
	})
	it("tudo conferido, mas sem data do mais antigo: cai na contagem de pendentes", () => {
		expect(describeFolderReview(review({ total: 4, reviewed: 4, oldestReviewedAt: null }))).toBe("0 de 4 insumos ainda não conferidos.")
	})
	it("parcial: conta os pendentes", () => {
		expect(describeFolderReview(review({ total: 7, reviewed: 2 }))).toBe("5 de 7 insumos ainda não conferidos.")
	})
})

describe("formatConferenceAuthor", () => {
	it("sem conferência: vazio", () => {
		expect(formatConferenceAuthor(undefined)).toBe("")
	})
	it("sem nome (registro antigo): vazio", () => {
		expect(formatConferenceAuthor(conference({ reviewedByName: null }))).toBe("")
	})
	it("nome vazio: vazio", () => {
		expect(formatConferenceAuthor(conference({ reviewedByName: "" }))).toBe("")
	})
	it("com nome: ' por <nome>'", () => {
		expect(formatConferenceAuthor(conference({ reviewedByName: "Ten Ana" }))).toBe(" por Ten Ana")
	})
})

describe("describeFolderConference", () => {
	it("nada entrou depois, sem autor", () => {
		expect(describeFolderConference(conference({}), ISO)).toBe("Conferida em 09/06/2026. Nada entrou desde então.")
	})
	it("nada entrou depois, com autor", () => {
		expect(describeFolderConference(conference({ reviewedByName: "Ten Ana" }), ISO)).toBe("Conferida em 09/06/2026 por Ten Ana. Nada entrou desde então.")
	})
	it("um item entrou depois", () => {
		expect(describeFolderConference(conference({ addedSince: 1, reviewedByName: "Ten Ana" }), ISO)).toBe(
			"Conferida em 09/06/2026 por Ten Ana; 1 item entrou depois."
		)
	})
	it("vários itens entraram depois", () => {
		expect(describeFolderConference(conference({ addedSince: 3 }), ISO)).toBe("Conferida em 09/06/2026; 3 itens entraram depois.")
	})
})
