import { describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { DocumentLimitError, PdfTooLargeError } from "../lib/document-limits.ts"
import { pdfReaderLoad, readPdfIsolated, workerCommand, workerPathFor } from "./pdf-isolated.ts"
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
		const result = await readPdfIsolated(minimalPdf())
		expect(result.text).toContain("RADA teste")
		expect(result.pages).toHaveLength(1)
		// O caminho da submissão passa por aqui.
		expect((await toSubmissionText(minimalPdf(), "application/pdf")).text).toBe(result.text)
	})

	it("devolve o teto de páginas como PdfTooLargeError", async () => {
		const error = await failure(readPdfIsolated(minimalPdf(), { maxPages: 0 }))
		expect(error).toBeInstanceOf(PdfTooLargeError)
		expect(error?.message).toContain("1 páginas")
	})

	it("prazo estourado mata o filho e vira DocumentLimitError", async () => {
		const error = await failure(readPdfIsolated(minimalPdf(), { timeoutMs: 1 }))
		expect(error).toBeInstanceOf(DocumentLimitError)
		expect(error?.message).toContain("para ser lido")
	})

	it.if(process.platform === "linux")("memória acima do teto mata o filho e vira DocumentLimitError", async () => {
		const error = await failure(readPdfIsolated(minimalPdf(), { maxRssBytes: 1 }))
		expect(error).toBeInstanceOf(DocumentLimitError)
		expect(error?.message).toContain("memória")
	})

	it("arquivo que não é PDF falha como erro comum, sem derrubar quem chamou", async () => {
		const error = await failure(readPdfIsolated(new TextEncoder().encode("não sou um pdf")))
		expect(error).toBeInstanceOf(Error)
		expect(error).not.toBeInstanceOf(DocumentLimitError)
	})

	it("recusa que se repete não relê o arquivo: a mesma falha volta sem subprocesso", async () => {
		const bytes = minimalPdf()
		const limits = { timeoutMs: 2 }
		const first = await failure(readPdfIsolated(bytes, limits))
		const started = performance.now()
		const second = await failure(readPdfIsolated(bytes, limits))
		expect(second).toBe(first)
		// Sem spawn: a resposta é imediata.
		expect(performance.now() - started).toBeLessThan(20)
	})

	it("no máximo duas leituras ao mesmo tempo, mesmo com a fila em movimento", async () => {
		let peak = 0
		const sampler = setInterval(() => {
			peak = Math.max(peak, pdfReaderLoad().running)
		}, 1)
		// Leituras que chegam enquanto outras terminam: o caso em que a vaga podia ser tomada
		// por quem chegou depois, além de quem esperava na fila.
		const reads: Array<Promise<{ text: string }>> = []
		for (let n = 0; n < 6; n++) {
			reads.push(readPdfIsolated(minimalPdf(), { maxPages: 100 + n }))
			await Bun.sleep(15)
		}
		const results = await Promise.all(reads)
		clearInterval(sampler)
		expect(results.every((result) => result.text.includes("RADA teste"))).toBe(true)
		expect(peak).toBeLessThanOrEqual(2)
		expect(pdfReaderLoad()).toEqual({ running: 0, waiting: 0 })
	})

	it("o event loop segue livre enquanto o filho lê", async () => {
		let ticks = 0
		const ticker = setInterval(() => {
			ticks += 1
		}, 5)
		await readPdfIsolated(minimalPdf())
		clearInterval(ticker)
		expect(ticks).toBeGreaterThan(0)
	})
})

describe("worker no bundle de produção", () => {
	it("no código-fonte, aponta para o pdf-worker.ts ao lado", () => {
		expect(workerPathFor("file:///app/apps/alpha/src/extraction/pdf-isolated.ts")).toBe("/app/apps/alpha/src/extraction/pdf-worker.ts")
	})

	// Mesmos entrypoints e nomes do `build` do package.json: se o bundle deixar de gerar o
	// worker ao lado do index, a leitura de PDF quebra só em produção.
	it("o bundle gera o worker onde o index o procura, e o worker lê o PDF", async () => {
		const outdir = mkdtempSync(join(tmpdir(), "alpha-bundle-"))
		try {
			const build = await Bun.build({
				entrypoints: [join(import.meta.dir, "../index.ts"), join(import.meta.dir, "pdf-worker.ts")],
				outdir,
				target: "bun",
				naming: "[name].[ext]",
			})
			expect(build.success).toBe(true)

			const worker = workerPathFor(pathToFileURL(join(outdir, "index.js")).href)
			expect(existsSync(worker)).toBe(true)

			// Como em produção: só o PATH no ambiente e diretório de trabalho sem escrita.
			const child = Bun.spawn({
				cmd: workerCommand(worker, 10),
				stdin: new Blob([minimalPdf()]),
				stdout: "pipe",
				stderr: "pipe",
				cwd: "/",
				env: { PATH: process.env.PATH ?? "" },
			})
			const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
			expect(stderr).toBe("")
			const reply = JSON.parse(stdout.trim())
			expect(reply.ok).toBe(true)
			expect(JSON.stringify(reply.result)).toContain("RADA teste")
		} finally {
			rmSync(outdir, { recursive: true, force: true })
		}
	}, 30_000)
})
