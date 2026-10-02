/**
 * Subprocesso de leitura de PDF — ver `pdf-isolated.ts`.
 *
 * Lê o PDF do stdin, escreve UMA linha JSON no stdout e sai. Uso:
 *   bun pdf-worker.ts <inspect|text> <maxPages>
 *
 * Não importa `env.ts` nem cliente nenhum: roda sem as variáveis do serviço (o pai passa só o
 * PATH), e um PDF que explore o pdf.js não alcança segredo nenhum.
 */

import { PdfTooLargeError } from "../lib/document-limits.ts"
import { countPdfPages, pdfToSubmissionText } from "./to-text.ts"

export type PdfWorkerReply =
	| { ok: true; mode: "inspect"; pages: number }
	| { ok: true; mode: "text"; result: Awaited<ReturnType<typeof pdfToSubmissionText>> }
	| { ok: false; kind: "too_large"; pages: number; maxPages: number }
	| { ok: false; kind: "error"; message: string }

async function main(): Promise<PdfWorkerReply> {
	const [mode, rawMaxPages] = process.argv.slice(2)
	const maxPages = Number(rawMaxPages)
	if ((mode !== "inspect" && mode !== "text") || !Number.isFinite(maxPages))
		return { ok: false, kind: "error", message: "uso: pdf-worker <inspect|text> <maxPages>" }

	const bytes = new Uint8Array(await Bun.stdin.arrayBuffer())
	try {
		if (mode === "inspect") return { ok: true, mode, pages: await countPdfPages(bytes, maxPages) }
		return { ok: true, mode, result: await pdfToSubmissionText(bytes, { maxPages }) }
	} catch (error) {
		if (error instanceof PdfTooLargeError) return { ok: false, kind: "too_large", pages: error.pages, maxPages }
		return { ok: false, kind: "error", message: error instanceof Error ? error.message : String(error) }
	}
}

const reply = await main()
await Bun.write(Bun.stdout, `${JSON.stringify(reply)}\n`)
process.exit(0)
