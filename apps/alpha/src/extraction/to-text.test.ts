import { describe, expect, it } from "bun:test"
import { DocumentLimitError } from "../lib/document-limits.ts"
import { inspectSubmissionDocument, MAX_PDF_PAGES, PdfTooLargeError, pdfToSubmissionText } from "./to-text.ts"

/**
 * PDF mínimo válido, montado à mão: uma página com uma linha de texto. Serve para
 * exercitar o caminho do pdf.js sem trazer arquivo binário para o repositório.
 */
function minimalPdf(): Uint8Array {
	const objects = [
		"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
		"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
		"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj",
		"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
		"5 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (RADA teste) Tj ET\nendstream endobj",
	]

	let pdf = "%PDF-1.4\n"
	const offsets: number[] = []
	for (const object of objects) {
		offsets.push(pdf.length)
		pdf += `${object}\n`
	}

	const startxref = pdf.length
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
	pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${startxref}\n%%EOF\n`

	return new TextEncoder().encode(pdf)
}

describe("pdfToSubmissionText", () => {
	it("não destaca o buffer do chamador", async () => {
		// Regressão: o pdf.js transfere o ArrayBuffer para o worker. Sem a cópia interna,
		// `bytes` voltava com byteLength 0 e quem tentasse reusá-lo — hash, storage, OCR —
		// recebia vazio sem erro nenhum.
		const bytes = minimalPdf()
		const before = bytes.byteLength

		await pdfToSubmissionText(bytes)

		expect(bytes.byteLength).toBe(before)
	})

	it("devolve a fronteira de página, e não só o texto corrido", async () => {
		// `pages` é o que permite reconhecer cabeçalho e rodapé: sem a fronteira, borda
		// de página e meio de parágrafo viram a mesma coisa.
		const result = await pdfToSubmissionText(minimalPdf())

		expect(result.pages).toHaveLength(1)
		expect(result.text).toContain("RADA teste")
	})

	it("permite converter os mesmos bytes duas vezes", async () => {
		const bytes = minimalPdf()

		const first = await pdfToSubmissionText(bytes)
		const second = await pdfToSubmissionText(bytes)

		expect(second.text).toBe(first.text)
	})

	it("recusa PDF acima do teto de páginas antes de extrair o texto", async () => {
		// Página vazia comprime a quase nada: sem teto, milhares delas num upload pequeno
		// prendiam o processo montando texto página a página.
		await expect(pdfToSubmissionText(minimalPdf(), { maxPages: 0 })).rejects.toBeInstanceOf(PdfTooLargeError)
	})
})

/** PDF com `pages` páginas vazias — só a árvore de páginas, que é o que a inspeção conta. */
function blankPdf(pages: number): Uint8Array {
	const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ")
	let pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj\n`
	for (let i = 0; i < pages; i++) pdf += `${i + 3} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\n`
	pdf += "trailer<</Root 1 0 R>>\n%%EOF\n"
	return new TextEncoder().encode(pdf)
}

describe("inspectSubmissionDocument", () => {
	it("recusa no ENVIO o PDF acima do teto de páginas, com o motivo na mensagem", async () => {
		const error = await inspectSubmissionDocument(blankPdf(MAX_PDF_PAGES + 1), "application/pdf").then(
			() => null,
			(e: unknown) => e
		)
		expect(error).toBeInstanceOf(DocumentLimitError)
		expect((error as Error).message).toContain(`${MAX_PDF_PAGES + 1} páginas`)
	})

	it("aceita o PDF dentro do teto sem extrair o texto", async () => {
		expect(await inspectSubmissionDocument(blankPdf(2), "application/pdf")).toBeNull()
	})
})
