/**
 * @module auditor/services/report-client
 * Consumo da rota SSE da Nota Analítica Estratégica a partir da tela.
 *
 * `EventSource` não serve: o pedido é POST e carrega o recorte da competência no
 * corpo. Então é `fetch` + leitura do corpo, com o parse de frames SSE feito à
 * mão — o mesmo desenho do `#/sacdgc/client`.
 */

import type { AnalyticNoteRequest } from "./report-request"
import type { AnalyticNote } from "./report-schema"

const REPORT_ENDPOINT = "/api/auditor/report"

export interface AnalyticNoteResult {
	/** Documento pronto, montado no servidor. */
	markdown: string
	/** As seções cruas, para a tela destacar o que interessa sem reparsear Markdown. */
	note: AnalyticNote
}

export class AnalyticNoteError extends Error {
	readonly status?: number
	constructor(message: string, status?: number) {
		super(message)
		this.name = "AnalyticNoteError"
		this.status = status
	}
}

function messageForStatus(status: number, fallback: string): string {
	if (status === 401) return "Sessão expirada. Entre novamente para continuar."
	if (status === 403) return "Sua conta não tem permissão para gerar a nota analítica."
	if (status === 429) return fallback || "Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente."
	if (status === 503) return "A nota analítica por IA não está configurada neste ambiente."
	return fallback || `Falha ao gerar a nota (HTTP ${status}).`
}

/** Emite a nota da competência. `signal` cancela o pedido em curso (fechar o modal, sair da tela). */
export async function generateAnalyticNote(request: AnalyticNoteRequest, signal?: AbortSignal): Promise<AnalyticNoteResult> {
	const response = await fetch(REPORT_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
		body: JSON.stringify(request),
		signal,
	})

	if (!response.ok || !response.body) {
		let detail = ""
		try {
			const body = (await response.json()) as { message?: string; statusMessage?: string }
			detail = body.message ?? body.statusMessage ?? ""
		} catch {
			// resposta sem corpo JSON — a mensagem por status já basta.
		}
		throw new AnalyticNoteError(messageForStatus(response.status, detail), response.status)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	let result: AnalyticNoteResult | null = null

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })

		let boundary = buffer.indexOf("\n\n")
		while (boundary !== -1) {
			const frame = buffer.slice(0, boundary)
			buffer = buffer.slice(boundary + 2)
			boundary = buffer.indexOf("\n\n")

			// Comentário (`: keep-alive`) não é evento.
			if (frame.startsWith(":")) continue

			let name = "message"
			const dataLines: string[] = []
			for (const line of frame.split("\n")) {
				if (line.startsWith("event:")) name = line.slice(6).trim()
				else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
			}
			if (dataLines.length === 0) continue

			const payload = JSON.parse(dataLines.join("\n")) as unknown
			if (name === "failed") {
				const message = (payload as { message?: string }).message
				throw new AnalyticNoteError(message || "Falha ao gerar a nota analítica.")
			}
			if (name === "done") result = payload as AnalyticNoteResult
		}
	}

	// Stream encerrado sem `done`: conexão cortada no meio. Sem este erro a tela
	// abriria um documento vazio como se fosse a nota da competência.
	if (!result) throw new AnalyticNoteError("A conexão com o servidor foi encerrada antes da nota terminar. Tente novamente.")
	return result
}
