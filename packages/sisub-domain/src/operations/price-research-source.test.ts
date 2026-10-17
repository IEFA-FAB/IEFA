import { describe, expect, test } from "bun:test"
import { assertSourceConsultation } from "./price-research.ts"
import { formatConsultedAt, type PriceResearchSourceConsultation } from "./price-research-source.ts"

const source = (over: Partial<PriceResearchSourceConsultation> = {}): PriceResearchSourceConsultation => ({
	consultedAt: "2026-10-16T14:58:30.000Z",
	totalRecords: 8402,
	totalPages: 17,
	pagesFetched: 5,
	coverage: "window",
	...over,
})
const now = new Date("2026-10-16T15:00:00Z")

describe("consulta à fonte", () => {
	test("hora da consulta sai em Brasília, no mesmo texto em qualquer máquina", () => {
		expect(formatConsultedAt("2026-10-16T14:58:30.000Z")).toBe("2026-10-16 11:58:30")
		expect(formatConsultedAt("2026-10-17T01:30:00.000Z")).toBe("2026-10-16 22:30:00")
	})

	test("coleta parcial não grava", () => {
		expect(() => assertSourceConsultation(source({ coverage: "truncated", pagesFetched: 40, totalPages: 52 }), now)).toThrow("Coleta parcial")
	})

	test("janela completa e todas as páginas gravam", () => {
		expect(() => assertSourceConsultation(source(), now)).not.toThrow()
		expect(() => assertSourceConsultation(source({ coverage: "complete", pagesFetched: 17 }), now)).not.toThrow()
		expect(() => assertSourceConsultation(undefined, now)).not.toThrow()
	})

	test("hora no futuro e páginas que não batem são recusadas", () => {
		expect(() => assertSourceConsultation(source({ consultedAt: "2026-10-16T16:00:00.000Z" }), now)).toThrow("Hora da consulta")
		expect(() => assertSourceConsultation(source({ pagesFetched: 18 }), now)).toThrow("Páginas lidas")
		expect(() => assertSourceConsultation(source({ coverage: "complete", pagesFetched: 16 }), now)).toThrow("Páginas lidas")
	})
})
