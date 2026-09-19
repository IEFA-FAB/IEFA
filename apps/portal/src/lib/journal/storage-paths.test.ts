import { describe, expect, it } from "bun:test"
import { ALLOWED_EXTENSIONS, CONTENT_TYPE_BY_EXTENSION, isPathOfArticle, parseSubmissionUploadPath } from "./storage-paths"

const ARTICLE = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"

describe("parseSubmissionUploadPath", () => {
	it("aceita os caminhos que o uploadArticleFile monta", () => {
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/manuscript.pdf`)).toEqual({ articleId: ARTICLE, version: 1, kind: "manuscript", extension: "pdf" })
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/source.typ`)?.kind).toBe("source")
		expect(parseSubmissionUploadPath(`${ARTICLE}/v3/supplementary_12.csv`)).toEqual({
			articleId: ARTICLE,
			version: 3,
			kind: "supplementary",
			extension: "csv",
		})
	})

	it("recusa extensão fora da lista do tipo", () => {
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/manuscript.html`)).toBeNull()
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/manuscript.zip`)).toBeNull()
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/supplementary_0.svg`)).toBeNull()
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/source.pdf`)).toBeNull()
		// Maiúscula é normalizada no cliente; o servidor não aceita variações.
		expect(parseSubmissionUploadPath(`${ARTICLE}/v1/manuscript.PDF`)).toBeNull()
	})

	it("recusa nome, versão, travessia e prefixo fora da convenção", () => {
		for (const path of [
			`${ARTICLE}/v1/index.pdf`,
			`${ARTICLE}/v0/manuscript.pdf`,
			`${ARTICLE}/manuscript.pdf`,
			`${ARTICLE}/v1/../outro/manuscript.pdf`,
			`${ARTICLE}/v1/sub/manuscript.pdf`,
			`not-a-uuid/v1/manuscript.pdf`,
			`/${ARTICLE}/v1/manuscript.pdf`,
			`${ARTICLE}/v1/manuscript.pdf.html`,
		]) {
			expect(`${path} -> ${JSON.stringify(parseSubmissionUploadPath(path))}`).toBe(`${path} -> null`)
		}
	})

	it("toda extensão permitida tem Content-Type definido", () => {
		for (const extensions of Object.values(ALLOWED_EXTENSIONS)) {
			for (const ext of extensions) expect(CONTENT_TYPE_BY_EXTENSION[ext]).toBeString()
		}
	})
})

describe("isPathOfArticle", () => {
	it("só aceita caminho sob o prefixo do próprio artigo", () => {
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/v1/manuscript.pdf`)).toBe(true)
		expect(isPathOfArticle(ARTICLE, `ffffffff-9a4d-4e6f-8b2a-1c3d5e7f9a0b/v1/manuscript.pdf`)).toBe(false)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/../ffffffff/v1/manuscript.pdf`)).toBe(false)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}x/v1/manuscript.pdf`)).toBe(false)
	})
})
