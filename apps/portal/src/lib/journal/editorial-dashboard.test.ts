import { describe, expect, test } from "bun:test"
import { parseEditorialDashboardRows } from "./editorial-dashboard"

/** Uma linha como a view de 20260926218000 devolve. */
const row = {
	id: "00000000-0000-0000-0000-0000000000b1",
	submission_number: "S-1",
	title_pt: "Título",
	title_en: "Title",
	status: "submitted",
	article_type: "research",
	subject_area: "logística",
	submitted_at: "2026-09-26T12:00:00Z",
	days_since_submission: 3,
	submitter_name: "Maria Souza",
	completed_reviews: 1,
	pending_reviews: 2,
}

describe("parseEditorialDashboardRows", () => {
	test("linha completa passa, com o título em português que o painel mostra e ordena", () => {
		const [article] = parseEditorialDashboardRows([row])
		expect(article?.title_pt).toBe("Título")
		expect(article?.completed_reviews).toBe(1)
	})

	test("coluna ausente na view vira erro com o nome dela (antes o cast escondia)", () => {
		const { title_pt: _missing, ...withoutTitle } = row
		expect(() => parseEditorialDashboardRows([withoutTitle])).toThrow(/title_pt/)
	})

	test("submissão de quem ainda não tem perfil: nome nulo", () => {
		expect(parseEditorialDashboardRows([{ ...row, submitter_name: null }])[0]?.submitter_name).toBeNull()
	})

	test("numeric e bigint como texto (PostgREST) viram número; rascunho sem data fica nulo", () => {
		const [article] = parseEditorialDashboardRows([{ ...row, days_since_submission: "3", completed_reviews: "0", submitted_at: null }])
		expect(article?.days_since_submission).toBe(3)
		expect(article?.completed_reviews).toBe(0)
		expect(article?.submitted_at).toBeNull()
	})

	test("sem linhas (ou null do cliente): lista vazia", () => {
		expect(parseEditorialDashboardRows([])).toEqual([])
		expect(parseEditorialDashboardRows(null)).toEqual([])
	})
})
