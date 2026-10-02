/**
 * Subprocesso de leitura de PDF — ver `pdf-isolated.ts`.
 *
 * Lê o PDF do stdin, escreve UMA linha JSON no stdout e sai. Uso:
 *   bun pdf-worker.ts <maxPages>
 *
 * Não importa `env.ts` nem cliente nenhum: roda sem as variáveis do serviço (o pai passa só o
 * PATH), e um PDF que explore o pdf.js não alcança segredo nenhum.
 */

import { PdfTooLargeError } from "../lib/document-limits.ts"
import { pdfToSubmissionText } from "./to-text.ts"

export type PdfWorkerReply =
	| { ok: true; result: Awaited<ReturnType<typeof pdfToSubmissionText>> }
	| { ok: false; kind: "too_large"; pages: number; maxPages: number }
	| { ok: false; kind: "error"; message: string }

async function main(): Promise<PdfWorkerReply> {
	const maxPages = Number(process.argv[2])
	if (!Number.isFinite(maxPages)) return { ok: false, kind: "error", message: "uso: pdf-worker <maxPages>" }

	const bytes = new Uint8Array(await Bun.stdin.arrayBuffer())
	try {
		return { ok: true, result: await pdfToSubmissionText(bytes, { maxPages }) }
	} catch (error) {
		if (error instanceof PdfTooLargeError) return { ok: false, kind: "too_large", pages: error.pages, maxPages }
		return { ok: false, kind: "error", message: error instanceof Error ? error.message : String(error) }
	}
}

const reply = await main()
await Bun.write(Bun.stdout, `${JSON.stringify(reply)}\n`)
process.exit(0)
