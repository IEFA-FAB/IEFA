/**
 * @module sacdgc/client
 * Consumo da rota SSE de análise a partir da tela.
 *
 * `EventSource` não serve: o pedido é POST e carrega o recorte da UG no corpo.
 * Então é `fetch` + leitura do corpo, com o parse de frames SSE feito à mão.
 */

import type { DgcAnalysisRequest } from "#/sacdgc/request"
import type { DgcAnalysis } from "#/sacdgc/types"

const ANALYZE_ENDPOINT = "/api/sacdgc/analyze"

export class DgcAnalysisError extends Error {
	readonly status?: number
	constructor(message: string, status?: number) {
		super(message)
		this.name = "DgcAnalysisError"
		this.status = status
	}
}

function messageForStatus(status: number, fallback: string): string {
	if (status === 401) return "Sessão expirada. Entre novamente para continuar."
	if (status === 403) return "Sua conta não tem permissão para usar a análise do SAC-DGC."
	if (status === 429) return fallback || "Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente."
	if (status === 503) return "A análise por IA não está configurada neste ambiente."
	return fallback || `Falha na análise (HTTP ${status}).`
}

/** Emite uma análise por UG. `signal` cancela o pedido em curso (troca de tela, botão cancelar). */
export async function analyzeUg(request: DgcAnalysisRequest, signal?: AbortSignal): Promise<DgcAnalysis> {
	const response = await fetch(ANALYZE_ENDPOINT, {
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
		throw new DgcAnalysisError(messageForStatus(response.status, detail), response.status)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	let analysis: DgcAnalysis | null = null

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
				throw new DgcAnalysisError(message || "Falha ao gerar a análise.")
			}
			if (name === "done") analysis = payload as DgcAnalysis
		}
	}

	// Stream encerrado sem `done`: conexão cortada no meio. Sem este erro a tela
	// mostraria a UG como concluída e sem achados — o estado vazio mentindo sobre falha.
	if (!analysis) throw new DgcAnalysisError("A conexão com o servidor foi encerrada antes da análise terminar. Tente novamente.")
	return analysis
}
