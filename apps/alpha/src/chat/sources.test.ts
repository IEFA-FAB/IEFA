import { describe, expect, it } from "bun:test"
import { makeDocument } from "./fixtures.test-helpers.ts"
import { buildSourceBundle, labelFindings, SUMMARY_SECTION_PREVIEW_CHARS, summarizeDocument } from "./sources.ts"

describe("buildSourceBundle", () => {
	it("abaixo do teto, manda o texto integral e não liga as ferramentas de leitura", () => {
		const doc = makeDocument()
		const bundle = buildSourceBundle([doc], 150_000)

		expect(bundle.summarized).toBe(false)
		expect(bundle.documents).toEqual([{ label: "D1", name: doc.name, form: "full", content: doc.text }])
	})

	it("acima do teto, manda o sumário e liga as ferramentas", () => {
		const doc = makeDocument()
		const bundle = buildSourceBundle([doc], doc.text.length - 1)

		expect(bundle.summarized).toBe(true)
		expect(bundle.documents[0]).toMatchObject({ label: "D1", form: "summary", totalChars: doc.text.length })
	})

	it("resume só o que não cabe — a fonte menor vai inteira mesmo com a soma acima do teto", () => {
		const small = makeDocument({ label: "D1", name: "tr.docx" })
		const big = makeDocument({ label: "D2", name: "edital.pdf", text: "x".repeat(10_000) })
		const bundle = buildSourceBundle([big, small], small.text.length + 100)

		// A ordem de apresentação é a de entrada, não a do orçamento.
		expect(bundle.documents.map((doc) => [doc.label, doc.form])).toEqual([
			["D2", "summary"],
			["D1", "full"],
		])
	})

	it("sem fonte nenhuma, não há o que resumir", () => {
		expect(buildSourceBundle([], 10)).toEqual({ documents: [], summarized: false })
	})
})

describe("summarizeDocument", () => {
	it("lista a árvore inteira e o começo das seções de nível 1", () => {
		const summary = summarizeDocument(makeDocument())

		expect(summary).toContain("2.1 Necessidade (")
		expect(summary).toContain("### 3 GARANTIA\nA garantia será de 12 meses")
		// Subseção entra no índice, não na prévia.
		expect(summary).not.toContain("### 2.1")
	})

	it("corta a prévia de seção longa e sinaliza o corte", () => {
		const doc = makeDocument({ nodes: [{ path: "1", level: 1, title: "OBJETO", body: "a".repeat(SUMMARY_SECTION_PREVIEW_CHARS + 50) }] })
		expect(summarizeDocument(doc)).toContain(`${"a".repeat(SUMMARY_SECTION_PREVIEW_CHARS)} […]`)
	})

	it("documento sem seções reconhecíveis manda o começo do texto e aponta a busca", () => {
		const summary = summarizeDocument(makeDocument({ nodes: [], text: "texto corrido sem numeração" }))
		expect(summary).toContain("use buscar_no_documento")
		expect(summary).toContain("texto corrido sem numeração")
	})
})

describe("labelFindings", () => {
	const row = (id: string, severity: "BLOQUEANTE" | "GRAVE" | "MEDIA" | "INFORMATIVA", section_path: string | null) => ({
		id,
		severity,
		category: "CONTEUDO",
		status: "INCONFORME",
		section_path,
		message: id,
		legal_ref: null,
		suggestion: null,
		triage: null,
		triage_note: null,
	})

	it("ordena por severidade e depois pela seção em ordem numérica, e rotula A1, A2…", () => {
		const labeled = labelFindings([row("m", "MEDIA", "1"), row("g10", "GRAVE", "10"), row("g2", "GRAVE", "2"), row("b", "BLOQUEANTE", null)])

		expect(labeled.map((finding) => [finding.label, finding.id])).toEqual([
			["A1", "b"],
			["A2", "g2"],
			["A3", "g10"],
			["A4", "m"],
		])
		// `legal_ref` nulo no banco vira lista vazia — o prompt não quebra no `.map`.
		expect(labeled[0].legal_ref).toEqual([])
	})
})
