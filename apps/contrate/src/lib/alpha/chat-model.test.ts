import { describe, expect, it } from "bun:test"
import { ChatTurnError, chunkLabel, describeChatError, findingQuestion, purgeNotice, splitRedaction } from "./chat-model"
import { AlphaRequestError } from "./client"

describe("splitRedaction", () => {
	it("separa o bloco de redação e tira a linha de seção do que se copia", () => {
		const parts = splitRedaction("O prazo falta [N1].\n\n```redacao\nSeção: 3.2\nA garantia será de 12 meses.\n```\n\nConfira.")

		expect(parts).toEqual([
			{ kind: "markdown", text: "O prazo falta [N1].\n\n" },
			{ kind: "redacao", section: "3.2", text: "A garantia será de 12 meses." },
			{ kind: "markdown", text: "\n\nConfira." },
		])
	})

	it("bloco sem linha de seção", () => {
		expect(splitRedaction("```redacao\ntexto\n```")).toEqual([{ kind: "redacao", section: null, text: "texto" }])
	})

	it("bloco ainda chegando (sem fechamento) já vira cartão", () => {
		expect(splitRedaction("Veja:\n```redacao\nA garan")).toEqual([
			{ kind: "markdown", text: "Veja:\n" },
			{ kind: "redacao", section: null, text: "A garan" },
		])
	})

	it("sem bloco, o texto inteiro é markdown", () => {
		expect(splitRedaction("só texto")).toEqual([{ kind: "markdown", text: "só texto" }])
	})
})

describe("purgeNotice", () => {
	const now = new Date("2026-09-22T12:00:00Z")

	it("conversa que não expira não tem aviso", () => {
		expect(purgeNotice({ purge_at: null }, now)).toBeNull()
	})

	it("longe do prazo: aviso discreto com a data de Brasília", () => {
		expect(purgeNotice({ purge_at: "2027-03-01T02:00:00Z" }, now)).toEqual({ text: "será apagada em 28/02/2027 se não for usada", urgent: false })
	})

	it("a 30 dias ou menos: aviso urgente", () => {
		expect(purgeNotice({ purge_at: "2026-10-10T12:00:00Z" }, now)?.urgent).toBe(true)
	})
})

describe("describeChatError", () => {
	it("limite diário diz quando o envio volta", () => {
		expect(describeChatError(new ChatTurnError("CHAT_DAILY_LIMIT", "x", "2026-09-23T11:00:00Z"))).toBe(
			"Você atingiu o limite diário de perguntas. O envio volta a ser possível em 23/09/2026, 08:00."
		)
	})

	it("recusa de anexo mostra a mensagem do α", () => {
		expect(describeChatError(new AlphaRequestError("no máximo 5 arquivos por conversa", 409, { code: "CHAT_ATTACHMENT_LIMIT" }))).toBe(
			"no máximo 5 arquivos por conversa"
		)
	})

	it('falha de rede vira mensagem em português, não o "Failed to fetch" do navegador', () => {
		expect(describeChatError(new TypeError("Failed to fetch"))).toBe("Não foi possível falar com o assistente. Verifique a conexão e tente de novo.")
	})

	it("turno em andamento em outra aba tem mensagem própria", () => {
		expect(describeChatError(new ChatTurnError("CHAT_TURN_IN_PROGRESS", "x"))).toContain("resposta em andamento")
	})

	it("nunca mostra o código cru", () => {
		expect(describeChatError(new ChatTurnError("MODEL_UNAVAILABLE", "o turno falhou"))).not.toContain("MODEL_UNAVAILABLE")
	})
})

describe("findingQuestion", () => {
	it("monta a pergunta com severidade, seção e mensagem", () => {
		expect(findingQuestion({ severity: "GRAVE", section_path: "5", message: "Falta o prazo." })).toBe(
			'Explique o achado GRAVE na seção 5: "Falta o prazo.". O que a norma exige e como reescrever o trecho para atender?'
		)
	})
})

describe("chunkLabel", () => {
	it("sem nome de documento, declara a ausência em vez de supor", () => {
		expect(chunkLabel({ id: "c", content: "", chapter: null, article: "Art. 18", section: null, metadata: null, document: null })).toBe(
			"Documento não identificado — Art. 18"
		)
	})

	it("usa o título da tabela document quando o chunk não traz source", () => {
		expect(
			chunkLabel({
				id: "c",
				content: "",
				chapter: null,
				article: null,
				section: "4.2",
				metadata: {},
				document: { id: "d", title: "Lei 14.133/2021", document_type: "LEI" },
			})
		).toBe("Lei 14.133/2021 — 4.2")
	})
})
