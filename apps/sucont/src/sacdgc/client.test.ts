import { afterEach, describe, expect, it } from "bun:test"
import { analyzeUg, DgcAnalysisError } from "#/sacdgc/client"
import type { DgcAnalysisRequest } from "#/sacdgc/request"

const REQUEST: DgcAnalysisRequest = {
	ugCode: "120006",
	ugName: "120006 - GRUPAMENTO DE APOIO DE BRASILIA",
	group: "GAP",
	competence: "JULHO/2026",
	panelsFound: [1, 2, 3, 4],
	rowCount: { 1: 1, 2: 0, 3: 0, 4: 0 },
	consolidated: "linha",
	truncated: false,
	groupContext: "",
}

const ANALYSIS = {
	identificacao: { codigoUg: "120006", nomeUg: "120006 - GRUPAMENTO DE APOIO DE BRASILIA", anoReferencia: "2026", mesReferencia: "JULHO" },
	analisePainel1: "a",
	analisePainel2: "b",
	analisePainel3: "c",
	analisePainel4: "d",
	alertasDeCriticidade: [],
	checklistAec: { indicadores: { total: 20, comApontamento: 0, semApontamento: 20 }, perguntas: [] },
}

const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
})

/** Responde o SSE em pedaços arbitrários — inclusive cortando um frame no meio. */
function stubSse(chunks: string[], init: ResponseInit = {}) {
	globalThis.fetch = (() => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				const encoder = new TextEncoder()
				for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
				controller.close()
			},
		})
		return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init }))
	}) as unknown as typeof fetch
}

describe("analyzeUg", () => {
	it("devolve a análise do evento done", async () => {
		stubSse([`event: start\ndata: {"ugCode":"120006"}\n\n`, `event: done\ndata: ${JSON.stringify(ANALYSIS)}\n\n`])
		expect(await analyzeUg(REQUEST)).toEqual(ANALYSIS)
	})

	// O keep-alive é o que impede o ALB de cortar a conexão em 60 s. Se o cliente o
	// tratasse como evento, o JSON.parse quebraria toda análise que demora.
	it("ignora o comentário de keep-alive", async () => {
		stubSse([`event: start\ndata: {}\n\n`, ": keep-alive\n\n", ": keep-alive\n\n", `event: done\ndata: ${JSON.stringify(ANALYSIS)}\n\n`])
		expect((await analyzeUg(REQUEST)).identificacao.codigoUg).toBe("120006")
	})

	it("remonta frame partido entre chunks da rede", async () => {
		const frame = `event: done\ndata: ${JSON.stringify(ANALYSIS)}\n\n`
		stubSse([frame.slice(0, 30), frame.slice(30, 80), frame.slice(80)])
		expect(await analyzeUg(REQUEST)).toEqual(ANALYSIS)
	})

	it("propaga a mensagem do evento failed", async () => {
		stubSse([`event: failed\ndata: {"message":"A análise excedeu o tempo máximo de espera."}\n\n`])
		await expect(analyzeUg(REQUEST)).rejects.toThrow("A análise excedeu o tempo máximo de espera.")
	})

	// Conexão cortada no meio devolveria "concluída sem achados" — um estado vazio
	// que mente sobre a falha, que é justamente o que o gestor não pode ler.
	it("falha quando o stream termina sem done", async () => {
		stubSse([`event: start\ndata: {}\n\n`, ": keep-alive\n\n"])
		await expect(analyzeUg(REQUEST)).rejects.toThrow(DgcAnalysisError)
		await expect(analyzeUg(REQUEST)).rejects.toThrow(/encerrada antes/)
	})

	it("traduz 503 em recado sobre IA não configurada", async () => {
		globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 503 }))) as unknown as typeof fetch
		await expect(analyzeUg(REQUEST)).rejects.toThrow(/não está configurada/)
	})

	it("traduz 403 em recado sobre permissão", async () => {
		globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 403 }))) as unknown as typeof fetch
		await expect(analyzeUg(REQUEST)).rejects.toThrow(/permissão/)
	})

	it("mostra a espera que o servidor devolveu no 429", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(new Response(JSON.stringify({ message: "Limite de requisições atingido (aguarde 42s)" }), { status: 429 }))) as unknown as typeof fetch
		await expect(analyzeUg(REQUEST)).rejects.toThrow(/aguarde 42s/)
	})
})
