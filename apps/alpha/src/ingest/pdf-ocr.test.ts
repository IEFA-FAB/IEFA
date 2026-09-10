import { describe, expect, it } from "bun:test"
import { sortPageFiles } from "./pdf-ocr.ts"

describe("sortPageFiles", () => {
	it("ordena por número de página, não lexicograficamente", () => {
		// É o ponto de falha silenciosa do OCR: ordenação por string põe a página 10
		// antes da 2, e o documento sai embaralhado sem erro nenhum.
		const files = ["page-10.png", "page-2.png", "page-1.png", "page-21.png", "page-3.png"]

		expect(sortPageFiles(files)).toEqual(["page-1.png", "page-2.png", "page-3.png", "page-10.png", "page-21.png"])
	})

	it("aceita o zero-padding que o pdftoppm usa em documento longo", () => {
		expect(sortPageFiles(["page-002.png", "page-011.png", "page-001.png"])).toEqual(["page-001.png", "page-002.png", "page-011.png"])
	})

	it("descarta o que não é página rasterizada", () => {
		// O diretório de trabalho também tem o PDF de entrada e os .txt do tesseract.
		expect(sortPageFiles(["input.pdf", "page-1.png", "page-1.png.out.txt"])).toEqual(["page-1.png"])
	})

	it("devolve lista vazia quando a rasterização não produziu nada", () => {
		expect(sortPageFiles(["input.pdf"])).toEqual([])
	})
})
