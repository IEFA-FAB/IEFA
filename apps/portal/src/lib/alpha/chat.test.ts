import { describe, expect, it } from "bun:test"
import { answerText, chunkLabel, parseSseBuffer } from "./chat"

describe("parseSseBuffer", () => {
	it("lê o nome do evento, não só o dado", () => {
		// Regressão: a versão anterior lia apenas as linhas `data:`. O α manda `status` a
		// cada nó do grafo e `complete` no fim — sem o nome, o `complete` virava mais um
		// `status` e a resposta nunca chegava à tela.
		const { events } = parseSseBuffer('event: complete\ndata: {"session_id":"s1"}\n\n')

		expect(events).toEqual([{ event: "complete", data: '{"session_id":"s1"}' }])
	})

	it("separa vários eventos e devolve o fragmento incompleto", () => {
		const { events, rest } = parseSseBuffer("event: status\ndata: {}\n\nevent: complete\ndata: {")

		expect(events.map((e) => e.event)).toEqual(["status"])
		expect(rest).toBe("event: complete\ndata: {")
	})

	it("junta `data:` de várias linhas", () => {
		const { events } = parseSseBuffer("event: complete\ndata: {\ndata: }\n\n")

		expect(events[0].data).toBe("{\n}")
	})

	it("ignora keep-alive e evento sem dado", () => {
		const { events } = parseSseBuffer(": keep-alive\n\nevent: status\n\n")

		expect(events).toEqual([])
	})

	it("assume `message` quando o evento não é nomeado", () => {
		expect(parseSseBuffer("data: oi\n\n").events[0].event).toBe("message")
	})

	it("preserva espaço interno do dado, removendo só o separador", () => {
		expect(parseSseBuffer("data:  dois espaços\n\n").events[0].data).toBe(" dois espaços")
	})
})

describe("answerText", () => {
	it("usa a resposta do grafo quando existe", () => {
		expect(answerText({ session_id: "s", final_response: "Conforme o RADA-e…", cited_documents: [] })).toBe("Conforme o RADA-e…")
	})

	it("não devolve string vazia quando o grafo termina sem base", () => {
		// `final_response` vazio é o desfecho honesto de "sem base normativa"; deixar passar
		// pintaria uma bolha de resposta em branco na conversa.
		const semBase = answerText({ session_id: "s", final_response: "   ", cited_documents: [], termination_reason: "no_documents_found" })

		expect(semBase.length).toBeGreaterThan(0)
	})
})

describe("chunkLabel", () => {
	const base = { id: "c1", content: "…", chapter: null, article: null, section: null, chunk_index: 0, metadata: null }

	it("junta documento e dispositivo", () => {
		expect(chunkLabel({ ...base, chapter: "Capítulo II", article: "Art. 7º", metadata: { source: "RADA-e Módulo C" } })).toBe(
			"RADA-e Módulo C — Capítulo II, Art. 7º"
		)
	})

	it("usa só o documento quando não há dispositivo", () => {
		expect(chunkLabel({ ...base, metadata: { source: "RADA-e Módulo A" } })).toBe("RADA-e Módulo A")
	})

	it("nunca devolve rótulo vazio", () => {
		// O rótulo é o que substitui o UUID na tela; vazio devolveria a citação ao estado
		// que esta mudança existe para corrigir.
		expect(chunkLabel(base).length).toBeGreaterThan(0)
		expect(chunkLabel({ ...base, metadata: { source: "   " } }).length).toBeGreaterThan(0)
	})

	it("tolera dispositivo parcial", () => {
		expect(chunkLabel({ ...base, article: "Art. 3º", metadata: { source: "RADA-e Módulo B" } })).toBe("RADA-e Módulo B — Art. 3º")
	})
})
