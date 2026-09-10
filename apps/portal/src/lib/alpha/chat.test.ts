import { describe, expect, it } from "bun:test"
import { answerText, chunkLabel, chunkText, parseSseBuffer } from "./chat"

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

	it("usa a seção quando não há artigo", () => {
		// São 226 trechos do acervo com seção e sem artigo. Sem isto o dispositivo estava
		// gravado e sumia da tela.
		expect(chunkLabel({ ...base, section: "14.2", metadata: { source: "RADA-e Módulo G" } })).toBe("RADA-e Módulo G — 14.2")
	})

	it("não emenda seção e artigo, que se repetem na numeração decimal", () => {
		// `14.2.2.4` já contém `14.2`; emendar renderia "14.2, 14.2.2.4".
		expect(chunkLabel({ ...base, section: "14.2", article: "14.2.2.4", metadata: { source: "RADA-e Módulo G" } })).toBe("RADA-e Módulo G — 14.2.2.4")
	})

	it("nomeia o documento pelo título quando o chunk não traz `metadata.source`", () => {
		// 1990 chunks — Lei 14.133, decretos, modelos da AGU — entram por outro caminho de
		// ingestão e não têm `source` no metadata.
		const lei = { ...base, chapter: "Art. 41", document: { id: "d1", title: "Lei nº 14.133, de 1º de abril de 2021", document_type: "LEI" } }

		expect(chunkLabel(lei)).toBe("Lei nº 14.133, de 1º de abril de 2021 — Art. 41")
	})

	it("declara a ausência em vez de supor o corpus", () => {
		// Assumir "RADA-e" carimbava o corpus errado em tudo que não vem por markdown:
		// atribuir a uma norma o texto de outra, ao lado de uma resposta que se apresenta
		// como fundamentada nela.
		expect(chunkLabel({ ...base, chapter: "Art. 41" })).not.toContain("RADA")
		expect(chunkLabel({ ...base, chapter: "Art. 41" })).toBe("Documento não identificado — Art. 41")
	})
})

describe("chunkText", () => {
	const base = { id: "c1", content: "", chapter: null, article: null, section: null, chunk_index: 0, metadata: null }

	it("tira o marcador de dispositivo, que é do nosso pipeline e não da norma", () => {
		const chunk = { ...base, content: "#### 14.2.2 RESTOS A PAGAR\n#### 14.2.2.1 A inscrição deverá ser realizada." }

		expect(chunkText(chunk)).toBe("14.2.2 RESTOS A PAGAR\n14.2.2.1 A inscrição deverá ser realizada.")
	})

	it("não altera uma palavra do texto", () => {
		// A marca sai; o texto, não. Resumir ou reescrever aqui seria inventar norma.
		const conteudo = "Art. 41 No caso de licitação que envolva o fornecimento de bens, a Administração poderá excepcionalmente:"

		expect(chunkText({ ...base, content: conteudo })).toBe(conteudo)
	})

	it("não confunde cerquilha no meio da linha com marcador", () => {
		expect(chunkText({ ...base, content: "O item nº #3 da tabela" })).toBe("O item nº #3 da tabela")
	})
})

describe("chunkLabel — capítulo redundante", () => {
	const base = { id: "c1", content: "…", chapter: null, article: null, section: null, chunk_index: 0, metadata: null }

	it("não repete o capítulo que já abre o dispositivo", () => {
		// 127 trechos são `chapter: "1"` com `section: "1.99"`, e saíam como "1, 1.99".
		expect(chunkLabel({ ...base, chapter: "1", section: "1.99", metadata: { source: "RADA-e Módulo C" } })).toBe("RADA-e Módulo C — 1.99")
		expect(chunkLabel({ ...base, chapter: "4", article: "4.1.19", metadata: { source: "RADA-e Módulo D" } })).toBe("RADA-e Módulo D — 4.1.19")
	})

	it("mantém capítulo e dispositivo quando são coordenadas independentes", () => {
		expect(chunkLabel({ ...base, chapter: "Capítulo II", article: "Art. 7º", metadata: { source: "RADA-e Módulo C" } })).toBe(
			"RADA-e Módulo C — Capítulo II, Art. 7º"
		)
		// `14` não prefixa `3.2.5`: numerações distintas, as duas informam.
		expect(chunkLabel({ ...base, chapter: "5", article: "3.2.5", metadata: { source: "RADA-e Módulo F" } })).toBe("RADA-e Módulo F — 5, 3.2.5")
	})

	it("não confunde prefixo de dígito com prefixo de nível", () => {
		// `1` prefixa `19.2` como TEXTO, mas não como numeração — o ponto é o que separa.
		expect(chunkLabel({ ...base, chapter: "1", article: "19.2", metadata: { source: "RADA-e Módulo C" } })).toBe("RADA-e Módulo C — 1, 19.2")
	})
})
