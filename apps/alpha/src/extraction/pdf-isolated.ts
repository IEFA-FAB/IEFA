/**
 * Leitura de PDF enviado por usuário em subprocesso, com prazo e teto de memória.
 *
 * O pdf.js faz o trabalho pesado (parse, fontes, montagem do texto) de forma síncrona no
 * event loop. Um PDF montado para isso — milhares de objetos, streams aninhados, fontes
 * gigantes — prendia o loop do α por minutos: todo turno de chat, todo SSE e todo
 * healthcheck esperavam juntos, e o ECS acabava matando a task por healthcheck. O teto de
 * páginas não protege disso: o custo está dentro da página, e a contagem já abre o documento.
 *
 * Aqui o PDF vai para um `bun` filho:
 *   - prazo (`PDF_READ_TIMEOUT_MS`): estourou, SIGKILL;
 *   - memória (`PDF_READ_MAX_RSS_BYTES`): o RSS do filho é lido de `/proc` a cada
 *     `RSS_POLL_MS`; passou, SIGKILL. (Fora do Linux não há `/proc`, e vale só o prazo.)
 *   - no máximo `MAX_CONCURRENT_READS` filhos ao mesmo tempo: a task tem 512 MB, e cinco
 *     leituras simultâneas no teto a derrubariam por OOM — o que esta mudança existe para
 *     evitar. As demais esperam na fila.
 *
 * O filho recebe só o `PATH`: nada de chave de serviço no ambiente de quem lê arquivo hostil.
 * Estouro de prazo ou de memória é `DocumentLimitError` (422 com a mensagem para quem enviou).
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { DocumentLimitError, MAX_PDF_PAGES, PdfTooLargeError } from "../lib/document-limits.ts"
import type { PdfWorkerReply } from "./pdf-worker.ts"
import type { PdfSubmissionText } from "./to-text.ts"

export const PDF_READ_TIMEOUT_MS = 30_000
export const PDF_READ_MAX_RSS_BYTES = 256 * 1024 * 1024
export const MAX_CONCURRENT_READS = 2
const RSS_POLL_MS = 100

const WORKER_PATH = new URL("./pdf-worker.ts", import.meta.url).pathname

export interface PdfReadLimits {
	timeoutMs?: number
	maxRssBytes?: number
	maxPages?: number
}

// ─── Fila ─────────────────────────────────────────────────────────────────────

let running = 0
const waiting: Array<() => void> = []

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
	if (running >= MAX_CONCURRENT_READS) {
		// A vaga chega PASSADA por quem terminou (`running` não desce): sem isso, um chamador
		// novo entre o fim de uma leitura e o despertar do próximo da fila entrava também, e
		// ficavam três filhos de até 256 MB numa task de 512 MB.
		await new Promise<void>((resolve) => waiting.push(resolve))
	} else {
		running += 1
	}
	try {
		return await task()
	} finally {
		const next = waiting.shift()
		if (next) next()
		else running -= 1
	}
}

/** Leituras em curso e na fila — para teste e diagnóstico. */
export function pdfReaderLoad(): { running: number; waiting: number } {
	return { running, waiting: waiting.length }
}

// ─── Recusas em cache ─────────────────────────────────────────────────────────

/**
 * Documento que já estourou prazo, memória ou páginas, ou que o pdf.js não abre, falha igual
 * na próxima vez. Sem lembrar disso, repetir `GET /submissions/:id/text` com um PDF hostil
 * ocupava as vagas de leitura em loop, sem cota nenhuma. A chave é o conteúdo (e os limites),
 * não o caminho: o mesmo arquivo enviado de novo também não é relido.
 */
const FAILURE_TTL_MS = 30 * 60 * 1000
const MAX_REMEMBERED_FAILURES = 200
const failures = new Map<string, { error: Error; expiresAt: number }>()

function failureKey(bytes: Uint8Array, limits: Required<PdfReadLimits>): string {
	const digest = createHash("sha256").update(bytes).digest("hex")
	return `${digest}:${limits.timeoutMs}:${limits.maxRssBytes}:${limits.maxPages}`
}

function rememberFailure(key: string, error: Error): void {
	failures.set(key, { error, expiresAt: Date.now() + FAILURE_TTL_MS })
	while (failures.size > MAX_REMEMBERED_FAILURES) {
		const oldest = failures.keys().next().value
		if (oldest === undefined) break
		failures.delete(oldest)
	}
}

/** Recusa que se repete: teto estourado ou erro relatado pelo próprio leitor. */
class PdfReadError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "PdfReadError"
	}
}

// ─── Memória do filho ─────────────────────────────────────────────────────────

/** RSS do processo em bytes, de `/proc/<pid>/status`. `null` fora do Linux ou se ele já saiu. */
async function readRss(pid: number): Promise<number | null> {
	try {
		const status = await readFile(`/proc/${pid}/status`, "utf8")
		const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status)
		return match ? Number(match[1]) * 1024 : null
	} catch {
		return null
	}
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function readPdfIsolated(bytes: Uint8Array, limits: PdfReadLimits = {}): Promise<PdfSubmissionText> {
	const resolved = {
		timeoutMs: limits.timeoutMs ?? PDF_READ_TIMEOUT_MS,
		maxRssBytes: limits.maxRssBytes ?? PDF_READ_MAX_RSS_BYTES,
		maxPages: limits.maxPages ?? MAX_PDF_PAGES,
	}
	const key = failureKey(bytes, resolved)
	const known = failures.get(key)
	if (known && known.expiresAt > Date.now()) throw known.error
	if (known) failures.delete(key)

	try {
		return await withSlot(() => runWorker(bytes, resolved))
	} catch (error) {
		// Só o que se repete com o mesmo arquivo; falha de infraestrutura (spawn) não fica.
		if (error instanceof DocumentLimitError || error instanceof PdfReadError) rememberFailure(key, error)
		throw error
	}
}

async function runWorker(bytes: Uint8Array, limits: Required<PdfReadLimits>): Promise<PdfSubmissionText> {
	const { timeoutMs, maxRssBytes, maxPages } = limits

	const child = Bun.spawn({
		cmd: [process.execPath, "--smol", WORKER_PATH, String(maxPages)],
		// Cópia com `ArrayBuffer` próprio: o `Blob` não aceita a visão sobre `SharedArrayBuffer`.
		stdin: new Blob([new Uint8Array(bytes)]),
		stdout: "pipe",
		stderr: "pipe",
		env: { PATH: process.env.PATH ?? "" },
	})

	let killedFor: "timeout" | "memory" | null = null
	const kill = (reason: "timeout" | "memory") => {
		if (killedFor) return
		killedFor = reason
		child.kill("SIGKILL")
	}

	const timer = setTimeout(() => kill("timeout"), timeoutMs)
	const checkMemory = async () => {
		const rss = await readRss(child.pid)
		if (rss !== null && rss > maxRssBytes) kill("memory")
	}
	const watchdog = setInterval(checkMemory, RSS_POLL_MS)
	void checkMemory()

	try {
		const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])

		if (killedFor === "timeout") throw new DocumentLimitError(`O PDF levou mais de ${Math.round(timeoutMs / 1000)} s para ser lido.`)
		if (killedFor === "memory") throw new DocumentLimitError("O PDF exige memória demais para ser lido.")

		let reply: PdfWorkerReply
		try {
			reply = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as PdfWorkerReply
		} catch {
			throw new PdfReadError(`leitura do PDF falhou (saída ${exitCode}): ${stderr.slice(0, 500)}`)
		}

		if (!reply.ok) {
			if (reply.kind === "too_large") throw new PdfTooLargeError(reply.pages, reply.maxPages)
			throw new PdfReadError(reply.message)
		}
		return reply.result
	} finally {
		clearTimeout(timer)
		clearInterval(watchdog)
	}
}
