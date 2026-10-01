import { describe, expect, test } from "bun:test"
import { type ArticleAccess, projectArticle, projectArticleDetails, projectAuthors, projectVersion, projectVersions } from "./article-projection"

const NONE: ArticleAccess = { isEditor: false, isSubmitter: false, isAssignedReviewer: false, isPublicReader: false }
const EDITOR: ArticleAccess = { ...NONE, isEditor: true }
const SUBMITTER: ArticleAccess = { ...NONE, isSubmitter: true }
const REVIEWER: ArticleAccess = { ...NONE, isAssignedReviewer: true }
const PUBLIC: ArticleAccess = { ...NONE, isPublicReader: true }

const ARTICLE = {
	id: "a1",
	submitter_id: "u-autor",
	submission_number: "2026-001",
	title_pt: "Título",
	title_en: "Title",
	abstract_pt: "Resumo",
	abstract_en: "Abstract",
	keywords_pt: ["a"],
	keywords_en: ["a"],
	article_type: "research",
	subject_area: "Logística",
	conflict_of_interest: "Fulano de Tal declara vínculo com a Base Aérea X",
	funding_info: "Bolsa do Fulano de Tal",
	data_availability: null,
	ethics_approval: null,
	status: "under_review",
	doi: null,
	volume: null,
	issue: null,
	page_start: null,
	page_end: null,
	published_at: null,
	submitted_at: "2026-09-01T00:00:00Z",
	created_at: "2026-08-01T00:00:00Z",
	updated_at: "2026-09-01T00:00:00Z",
	deleted_at: null,
}

const AUTHORS = [
	{
		id: "au1",
		article_id: "a1",
		full_name: "Fulano de Tal",
		email: "fulano@fab.mil.br",
		affiliation: "IEFA",
		orcid: "0000-0000-0000-0001",
		is_corresponding: true,
		author_order: 1,
		created_at: "x",
	},
]

const VERSIONS = [
	{
		id: "v2",
		article_id: "a1",
		version_number: 2,
		version_label: "Revisão 1",
		pdf_path: "a1/v2/manuscript.pdf",
		source_path: "a1/v2/source.typ",
		supplementary_paths: ["a1/v2/supplementary_0.csv"],
		uploaded_by: "u-autor",
		notes: "Nota interna do editor",
		created_at: "y",
	},
	{
		id: "v1",
		article_id: "a1",
		version_number: 1,
		version_label: null,
		pdf_path: "a1/v1/manuscript.pdf",
		source_path: null,
		supplementary_paths: null,
		uploaded_by: "u-autor",
		notes: null,
		created_at: "x",
	},
]

/** Tudo o que identifica autoria em qualquer ponto do payload. */
const IDENTITY_MARKERS = ["u-autor", "Fulano", "fulano@", "0000-0000-0000-0001", "IEFA", "source.typ", "Nota interna"]

describe("revisor (duplo-cego)", () => {
	test("o detalhe do artigo não carrega nada que identifique o autor", () => {
		const projected = projectArticleDetails({ article: ARTICLE, authors: AUTHORS, versions: VERSIONS, reviews: [{ assignment: {} }] }, REVIEWER)
		const serialized = JSON.stringify(projected)
		for (const marker of IDENTITY_MARKERS) expect(serialized).not.toContain(marker)
		expect(projected).not.toHaveProperty("reviews")
	})

	test("a linha do artigo sai sem submitter_id e sem as declarações que nomeiam pessoas", () => {
		const article = projectArticle(ARTICLE, REVIEWER)
		expect(article).not.toHaveProperty("submitter_id")
		expect(article).not.toHaveProperty("conflict_of_interest")
		expect(article).not.toHaveProperty("funding_info")
		expect(article).not.toHaveProperty("deleted_at")
		expect(article?.title_pt).toBe("Título")
		expect(article?.abstract_pt).toBe("Resumo")
	})

	test("não recebe coautor nenhum", () => {
		expect(projectAuthors(AUTHORS, REVIEWER)).toEqual([])
	})

	test("recebe manuscrito e suplementares de todas as versões, sem fonte, notes e uploaded_by", () => {
		const versions = projectVersions(VERSIONS, REVIEWER)
		expect(versions.map((v) => v.pdf_path)).toEqual(["a1/v2/manuscript.pdf", "a1/v1/manuscript.pdf"])
		expect(versions[0].supplementary_paths).toEqual(["a1/v2/supplementary_0.csv"])
		for (const version of versions) {
			expect(version).not.toHaveProperty("source_path")
			expect(version).not.toHaveProperty("notes")
			expect(version).not.toHaveProperty("uploaded_by")
		}
	})

	test("coluna nova na tabela não vaza (allowlist)", () => {
		expect(projectArticle({ ...ARTICLE, submitter_email: "x" }, REVIEWER)).not.toHaveProperty("submitter_email")
		expect(projectVersions([{ ...VERSIONS[0], uploader_name: "x" }], REVIEWER)[0]).not.toHaveProperty("uploader_name")
	})
})

describe("leitor público", () => {
	test("artigo sem submitter_id nem deleted_at", () => {
		const article = projectArticle({ ...ARTICLE, status: "published" }, PUBLIC)
		expect(article).not.toHaveProperty("submitter_id")
		expect(article).not.toHaveProperty("deleted_at")
		expect(article?.funding_info).toBe("Bolsa do Fulano de Tal")
	})

	test("coautores sem e-mail", () => {
		const [author] = projectAuthors(AUTHORS, PUBLIC)
		expect(author).not.toHaveProperty("email")
		expect(author.full_name).toBe("Fulano de Tal")
	})

	test("só a versão corrente, só com o PDF", () => {
		const versions = projectVersions([...VERSIONS].reverse(), PUBLIC)
		expect(versions).toEqual([{ id: "v2", article_id: "a1", version_number: 2, version_label: "Revisão 1", pdf_path: "a1/v2/manuscript.pdf", created_at: "y" }])
		expect(projectVersions([], PUBLIC)).toEqual([])
	})

	test("detalhe sem pareceres", () => {
		expect(projectArticleDetails({ article: ARTICLE, authors: null, versions: null, reviews: [] }, PUBLIC)).toEqual({
			article: projectArticle(ARTICLE, PUBLIC),
			authors: [],
			versions: [],
		})
	})
})

describe("autor submissor", () => {
	test("o próprio artigo e os coautores inteiros", () => {
		expect(projectArticle(ARTICLE, SUBMITTER)).toEqual(ARTICLE)
		expect(projectAuthors(AUTHORS, SUBMITTER)).toEqual(AUTHORS)
	})

	test("versões sem a anotação do editor e sem uploaded_by, com a fonte", () => {
		const versions = projectVersions(VERSIONS, SUBMITTER)
		expect(versions).toHaveLength(2)
		expect(versions[0]).not.toHaveProperty("notes")
		expect(versions[0]).not.toHaveProperty("uploaded_by")
		expect(versions[0].source_path).toBe("a1/v2/source.typ")
	})

	test("detalhe sem pareceres", () => {
		expect(projectArticleDetails({ article: ARTICLE, authors: AUTHORS, versions: VERSIONS, reviews: [] }, SUBMITTER)).not.toHaveProperty("reviews")
	})
})

describe("editor", () => {
	test("recebe tudo, inclusive pareceres", () => {
		const details = { article: ARTICLE, authors: AUTHORS, versions: VERSIONS, reviews: [{ assignment: {} }] }
		expect(projectArticleDetails(details, EDITOR)).toBe(details)
		expect(projectVersions(VERSIONS, EDITOR)).toEqual(VERSIONS)
	})

	test("editor que também é o submissor continua editor", () => {
		expect(projectVersions(VERSIONS, { ...EDITOR, isSubmitter: true })).toEqual(VERSIONS)
	})
})

describe("entradas fora do formato", () => {
	test("null e não-objeto não viram linha", () => {
		expect(projectArticle(null, REVIEWER)).toBeNull()
		expect(projectArticleDetails([ARTICLE], REVIEWER)).toBeNull()
		expect(projectVersion(null, REVIEWER)).toBeNull()
		expect(projectAuthors(null, PUBLIC)).toEqual([])
	})
})
