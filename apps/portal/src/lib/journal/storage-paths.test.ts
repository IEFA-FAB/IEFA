import { describe, expect, it } from "bun:test"
import {
	ALLOWED_EXTENSIONS,
	areVersionPathsOfArticle,
	CONTENT_TYPE_BY_EXTENSION,
	isPathOfArticle,
	parseStoredSubmissionPath,
	parseSubmissionUploadPath,
} from "./storage-paths"

const ARTICLE = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"
const OTHER = "ffffffff-9a4d-4e6f-8b2a-1c3d5e7f9a0b"

/**
 * Travessias que o `fetch` normaliza ao montar a URL do storage — o `..` literal era o
 * único recusado, e `<A>/%2e%2e/<B>/...` assinava o manuscrito de B.
 */
const TRAVERSALS = [
	`${ARTICLE}/%2e%2e/${OTHER}/v1/manuscript.pdf`,
	`${ARTICLE}/%2E%2E/${OTHER}/v1/manuscript.pdf`,
	`${ARTICLE}/v1/%2e%2e/%2e%2e/${OTHER}/v1/manuscript.pdf`,
	`${ARTICLE}/..%2f${OTHER}/v1/manuscript.pdf`,
	`${ARTICLE}/..%2F${OTHER}/v1/manuscript.pdf`,
	`${ARTICLE}%2fv1%2fmanuscript.pdf`,
	`${ARTICLE}/v1%2fmanuscript.pdf`,
	`${ARTICLE}/v1/manuscript%2epdf`,
	`${ARTICLE}\\..\\${OTHER}\\v1\\manuscript.pdf`,
	`${ARTICLE}/v1\\manuscript.pdf`,
	`${ARTICLE}/./v1/manuscript.pdf`,
	`${ARTICLE}/v1/./manuscript.pdf`,
	`${ARTICLE}//v1/manuscript.pdf`,
	`${ARTICLE}/v1//manuscript.pdf`,
	`${ARTICLE}/v1/manuscript.pdf/`,
	`${ARTICLE}/v1/manuscript.pdf?x=1`,
	`${ARTICLE}/v1/manuscript.pdf#x`,
	`${ARTICLE}/v1/manuscript.pdf\n`,
	`${ARTICLE.toUpperCase()}/v1/manuscript.pdf`,
	"",
]

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

describe("travessia codificada", () => {
	it("nenhum parser aceita percent-encoding, barra invertida ou segmento vazio/ponto", () => {
		for (const path of TRAVERSALS) {
			expect(`${path} -> ${JSON.stringify(parseSubmissionUploadPath(path))}`).toBe(`${path} -> null`)
			expect(`${path} -> ${JSON.stringify(parseStoredSubmissionPath(path))}`).toBe(`${path} -> null`)
			expect(`${path} -> ${isPathOfArticle(ARTICLE, path)}`).toBe(`${path} -> false`)
		}
	})
})

describe("parseStoredSubmissionPath", () => {
	it("aceita a extensão legada em maiúsculas, mas só da lista do tipo", () => {
		expect(parseStoredSubmissionPath(`${ARTICLE}/v1/manuscript.PDF`)).toEqual({ articleId: ARTICLE, version: 1, kind: "manuscript", extension: "pdf" })
		expect(parseStoredSubmissionPath(`${ARTICLE}/v1/manuscript.HTML`)).toBeNull()
		expect(parseStoredSubmissionPath(`${ARTICLE}/v1/supplementary_0.SVG`)).toBeNull()
	})
})

describe("isPathOfArticle", () => {
	it("só aceita caminho sob o prefixo do próprio artigo", () => {
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/v1/manuscript.pdf`)).toBe(true)
		expect(isPathOfArticle(ARTICLE, `${OTHER}/v1/manuscript.pdf`)).toBe(false)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/../ffffffff/v1/manuscript.pdf`)).toBe(false)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}x/v1/manuscript.pdf`)).toBe(false)
	})

	it("confere o tipo do arquivo quando o campo exige um", () => {
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/v2/manuscript.pdf`, "manuscript")).toBe(true)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/v2/supplementary_0.pdf`, "manuscript")).toBe(false)
		expect(isPathOfArticle(ARTICLE, `${ARTICLE}/v2/manuscript.pdf`, "source")).toBe(false)
	})
})

describe("areVersionPathsOfArticle", () => {
	it("exige manuscrito em pdf_path, fonte em source_path e suplementar na lista", () => {
		expect(
			areVersionPathsOfArticle(ARTICLE, {
				pdfPath: `${ARTICLE}/v1/manuscript.pdf`,
				sourcePath: `${ARTICLE}/v1/source.zip`,
				supplementaryPaths: [`${ARTICLE}/v1/supplementary_0.csv`],
			})
		).toBe(true)
		expect(areVersionPathsOfArticle(ARTICLE, { pdfPath: `${ARTICLE}/v1/source.zip` })).toBe(false)
		expect(areVersionPathsOfArticle(ARTICLE, { pdfPath: `${ARTICLE}/v1/manuscript.pdf`, sourcePath: `${OTHER}/v1/source.zip` })).toBe(false)
		expect(
			areVersionPathsOfArticle(ARTICLE, { pdfPath: `${ARTICLE}/v1/manuscript.pdf`, supplementaryPaths: [`${ARTICLE}/%2e%2e/${OTHER}/v1/supplementary_0.pdf`] })
		).toBe(false)
		expect(areVersionPathsOfArticle(ARTICLE, { pdfPath: `${ARTICLE}/%2e%2e/${OTHER}/v1/manuscript.pdf` })).toBe(false)
	})
})
