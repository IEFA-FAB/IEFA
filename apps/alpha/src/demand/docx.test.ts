import { describe, expect, test } from "bun:test"
import { docxToSubmissionText } from "../extraction/to-text.ts"
import { parseDocx } from "../sources/docx.ts"
import { buildDocx } from "./docx.ts"

describe("buildDocx", () => {
	const bytes = buildDocx([
		{ type: "heading", level: 1, text: "ESTUDO TÉCNICO PRELIMINAR" },
		{ type: "heading", level: 2, text: "2. Descrição da necessidade" },
		{ type: "paragraph", text: "Vãos sem vedação & sem <fechamento> seguro." },
		{ type: "table", columns: ["Item", "Unidade", "Quantidade"], rows: [["1", "UN", "3"]] },
	])

	test("o leitor de submissões lê títulos, texto e caracteres escapados", () => {
		const { paragraphs } = parseDocx(bytes)
		expect(paragraphs.map((paragraph) => paragraph.style)).toEqual(["Heading1", "Heading2", null, null])
		expect(paragraphs[2]?.text).toBe("Vãos sem vedação & sem <fechamento> seguro.")
	})

	test("tabela vira uma linha por registro, sem célula solta que pareça título", () => {
		const { paragraphs } = parseDocx(bytes)
		expect(paragraphs[3]?.text).toBe("Item: 1; Unidade: UN; Quantidade: 3")
		expect(docxToSubmissionText(bytes).text).toContain("Item: 1; Unidade: UN; Quantidade: 3")
	})
})
