import { describe, expect, it } from "bun:test"
import { DocumentLimitError, PdfTooLargeError } from "../lib/document-limits.ts"
import { readPdfIsolated } from "./pdf-isolated.ts"
import { toSubmissionText } from "./to-text.ts"

/** PDF de uma página com uma linha de texto, montado à mão (o mesmo de `to-text.test.ts`). */
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

const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(error: unknown) => error as Error
	)

describe("readPdfIsolated", () => {
	it("lê o texto no subprocesso, igual à leitura no processo", async () => {
		const result = await readPdfIsolated(minimalPdf(), "text")
		expect(result.text).toContain("RADA teste")
		expect(result.pages).toHaveLength(1)
		// O caminho da submissão passa por aqui.
		expect((await toSubmissionText(minimalPdf(), "application/pdf")).text).toBe(result.text)
	})

	it("conta páginas e devolve o teto como PdfTooLargeError", async () => {
		expect(await readPdfIsolated(minimalPdf(), "inspect")).toEqual({ pages: 1 })
		const error = await failure(readPdfIsolated(minimalPdf(), "inspect", { maxPages: 0 }))
		expect(error).toBeInstanceOf(PdfTooLargeError)
		expect(error?.message).toContain("1 páginas")
	})

	it("prazo estourado mata o filho e vira DocumentLimitError", async () => {
		const error = await failure(readPdfIsolated(minimalPdf(), "text", { timeoutMs: 1 }))
		expect(error).toBeInstanceOf(DocumentLimitError)
		expect(error?.message).toContain("para ser lido")
	})

	it.if(process.platform === "linux")("memória acima do teto mata o filho e vira DocumentLimitError", async () => {
		const error = await failure(readPdfIsolated(minimalPdf(), "text", { maxRssBytes: 1 }))
		expect(error).toBeInstanceOf(DocumentLimitError)
		expect(error?.message).toContain("memória")
	})

	it("arquivo que não é PDF falha como erro comum, sem derrubar quem chamou", async () => {
		const error = await failure(readPdfIsolated(new TextEncoder().encode("não sou um pdf"), "text"))
		expect(error).toBeInstanceOf(Error)
		expect(error).not.toBeInstanceOf(DocumentLimitError)
	})

	it("o event loop segue livre enquanto o filho lê", async () => {
		let ticks = 0
		const ticker = setInterval(() => {
			ticks += 1
		}, 5)
		await readPdfIsolated(minimalPdf(), "text")
		clearInterval(ticker)
		expect(ticks).toBeGreaterThan(0)
	})
})
