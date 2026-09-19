import { describe, expect, it } from "bun:test"
import {
	ArticleAuthorUpdateSchema,
	ArticleVersionInsertSchema,
	AuthorArticleFieldsSchema,
	EditorArticleUpdateSchema,
	editorOnlyArticleKeys,
	ReviewContentSchema,
	UserProfileFieldsSchema,
} from "./write-schemas"

const ARTICLE = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"

describe("colunas que o autor NÃO escreve", () => {
	it("o schema do autor descarta status, DOI, fascículo, datas, submitter e soft delete", () => {
		const parsed = AuthorArticleFieldsSchema.parse({
			title_pt: "Título",
			status: "published",
			doi: "10.1/x",
			volume: 1,
			issue: 2,
			published_at: "2026-01-01",
			submitted_at: "2026-01-01",
			submission_number: "2026-999",
			submitter_id: ARTICLE,
			deleted_at: null,
			id: ARTICLE,
		})
		expect(parsed).toEqual({ title_pt: "Título" })
	})

	it("editorOnlyArticleKeys aponta o que só o editor altera (o update do autor vira 403)", () => {
		const editorPayload = EditorArticleUpdateSchema.parse({ title_en: "T", status: "published", doi: "10.1/x" })
		expect(editorOnlyArticleKeys(editorPayload).sort()).toEqual(["doi", "status"])
		expect(editorOnlyArticleKeys(EditorArticleUpdateSchema.parse({ title_en: "T", funding_info: null }))).toEqual([])
	})

	it("o Kanban do editor continua mudando status", () => {
		expect(EditorArticleUpdateSchema.parse({ status: "under_review" })).toEqual({ status: "under_review" })
		expect(() => EditorArticleUpdateSchema.parse({ status: "whatever" })).toThrow()
	})
})

describe("ids de autorização não vêm do payload", () => {
	it("linha de autor não muda de artigo", () => {
		expect(ArticleAuthorUpdateSchema.parse({ full_name: "Ana", article_id: ARTICLE, id: ARTICLE })).toEqual({ full_name: "Ana" })
	})

	it("versão não aceita uploaded_by", () => {
		const parsed = ArticleVersionInsertSchema.parse({ article_id: ARTICLE, pdf_path: `${ARTICLE}/v2/manuscript.pdf`, uploaded_by: ARTICLE })
		expect(parsed).not.toHaveProperty("uploaded_by")
	})

	it("parecer não aceita assignment_id, is_draft nem submitted_at", () => {
		const parsed = ReviewContentSchema.parse({
			recommendation: "accept",
			assignment_id: ARTICLE,
			is_draft: false,
			submitted_at: "2026-01-01",
			id: ARTICLE,
		})
		expect(parsed).toEqual({ recommendation: "accept" })
	})

	it("nota fora de 1..5 é recusada", () => {
		expect(() => ReviewContentSchema.parse({ score_overall: 9 })).toThrow()
	})

	it("perfil não aceita id (vem da sessão); role segue para assertRoleChangeAllowed", () => {
		expect(UserProfileFieldsSchema.parse({ id: ARTICLE, full_name: "Ana", role: "editor" })).toEqual({ full_name: "Ana", role: "editor" })
	})
})
