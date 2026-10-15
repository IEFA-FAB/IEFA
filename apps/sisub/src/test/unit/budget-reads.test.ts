import { empenhoConsumesCreditLine } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { compareCreditLines, compareCreditNotes, empenhoExercicioFilter, valorVigenteFromEvents, yearOfDate } from "@/lib/budget-reads"

describe("empenhoExercicioFilter", () => {
	test("cobre o exercício e, quando ele é nulo, o ano de data_empenho", () => {
		expect(empenhoExercicioFilter([2026])).toBe(
			"and(exercicio.gte.2026,exercicio.lte.2026),and(exercicio.is.null,data_empenho.gte.2026-01-01,data_empenho.lte.2026-12-31)"
		)
	})

	test("vários anos viram o intervalo entre o menor e o maior", () => {
		expect(empenhoExercicioFilter([2026, 2024, 2025])).toContain("exercicio.gte.2024,exercicio.lte.2026")
	})

	test("sem ano não há o que ler", () => {
		expect(empenhoExercicioFilter([])).toBeNull()
	})

	test("é a mesma regra de ano da conta do domínio", () => {
		const line = { ug: null, nd: "339030", ptres: null, fonte: null, competencia: "2026-03-01" }
		const ne = { nd: "33903007", ptres: null, fonte: null, ug: null }
		// `exercicio` nulo: vale o ano de data_empenho, que é o segundo ramo do filtro
		expect(empenhoConsumesCreditLine(line, { ...ne, exercicio: null, dataEmpenho: "2026-05-02" })).toBe(true)
		expect(empenhoConsumesCreditLine(line, { ...ne, exercicio: null, dataEmpenho: "2025-12-30" })).toBe(false)
		// `exercicio` preenchido manda, mesmo com data de outro ano: primeiro ramo
		expect(empenhoConsumesCreditLine(line, { ...ne, exercicio: 2026, dataEmpenho: "2025-12-30" })).toBe(true)
	})
})

describe("valorVigenteFromEvents", () => {
	test("original + reforço − anulações (inclusive a legada); inscrição em RP não muda", () => {
		const events = [
			{ tipo: "reforco", valor: 100.1 },
			{ tipo: "anulacao", valor: 20 },
			{ tipo: "anulacao_total", valor: 30 },
			{ tipo: "cancelamento", valor: 5 },
			{ tipo: "rp_inscricao", valor: 999 },
		]
		expect(valorVigenteFromEvents(1000, events)).toBe(1045.1)
	})

	test("sem eventos, o vigente é o original", () => {
		expect(valorVigenteFromEvents(250.5, [])).toBe(250.5)
	})
})

describe("ordem das listas", () => {
	test("crédito: competência mais recente primeiro, depois ND", () => {
		const lines = [
			{ competencia: "2026-01-01", nd: "339030" },
			{ competencia: "2026-02-01", nd: "339039" },
			{ competencia: "2026-02-01", nd: "339030" },
		]
		expect([...lines].sort(compareCreditLines)).toEqual([lines[2], lines[1], lines[0]])
	})

	test("NC: emissão mais recente primeiro, depois registro mais recente", () => {
		const notes = [
			{ issued_on: "2026-03-01", created_at: "2026-03-01T10:00:00Z" },
			{ issued_on: "2026-03-01", created_at: "2026-03-01T12:00:00Z" },
			{ issued_on: "2026-04-01", created_at: "2026-04-01T09:00:00Z" },
		]
		expect([...notes].sort(compareCreditNotes)).toEqual([notes[2], notes[1], notes[0]])
	})

	test("yearOfDate lê o ano da competência", () => {
		expect(yearOfDate("2026-03-01")).toBe(2026)
		expect(yearOfDate("")).toBeNull()
	})
})
