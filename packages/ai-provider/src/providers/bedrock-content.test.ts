/**
 * Conversão de partes de mensagem para blocos do Converse.
 *
 * Existe por um bug que era invisível: o adapter mapeava só `text` e `image` e DESCARTAVA
 * o resto em silêncio. Um PDF anexado sumia sem erro, o modelo respondia sobre o que
 * sobrou, e a resposta parecia apenas ruim — não incompleta.
 */
import { describe, expect, it } from "bun:test"
import { contentBlocksFromMessageForTest as toBlocks } from "./bedrock.ts"

const base64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64")

function userMessage(content: unknown) {
	return { role: "user", content } as Parameters<typeof toBlocks>[0]
}

describe("blocos de conteúdo", () => {
	it("envia PDF como bloco de documento", () => {
		const blocks = toBlocks(
			userMessage([
				{ type: "text", content: "Segue a minuta." },
				{ type: "document", source: { type: "data", mimeType: "application/pdf", value: base64(64) } },
			])
		)
		const document = blocks.find((b) => "document" in b) as { document: { format: string; name: string } }
		expect(document.document.format).toBe("pdf")
	})

	it("acrescenta o bloco de texto que o serviço exige junto do documento", () => {
		// Sem texto na mesma mensagem, o Converse devolve ValidationException sem dizer por quê.
		const blocks = toBlocks(userMessage([{ type: "document", source: { type: "data", mimeType: "application/pdf", value: base64(16) } }]))
		expect(blocks.some((b) => "text" in b)).toBe(true)
	})

	it("usa nome neutro — o nome do arquivo é vetor de injeção de prompt", () => {
		const blocks = toBlocks(userMessage([{ type: "document", source: { type: "data", mimeType: "application/pdf", value: base64(16) } }]))
		const document = blocks.find((b) => "document" in b) as { document: { name: string } }
		expect(document.document.name).toBe("documento 1")
	})

	it("recusa formato que o serviço não aceita, dizendo quais aceita", () => {
		expect(() => toBlocks(userMessage([{ type: "document", source: { type: "data", mimeType: "image/tiff", value: base64(16) } }]))).toThrow(/não aceito/)
	})

	it("recusa documento acima do limite de 4,5 MB", () => {
		expect(() => toBlocks(userMessage([{ type: "document", source: { type: "data", mimeType: "application/pdf", value: base64(5 * 1024 * 1024) } }]))).toThrow(
			/4,5 MB/
		)
	})

	it("falha alto na parte que não sabe enviar, em vez de descartá-la", () => {
		expect(() => toBlocks(userMessage([{ type: "audio", source: { type: "data", mimeType: "audio/mpeg", value: base64(16) } }]))).toThrow(/não suportada/)
	})

	it("continua enviando texto e imagem como antes", () => {
		const blocks = toBlocks(
			userMessage([
				{ type: "text", content: "olá" },
				{ type: "image", source: { type: "data", mimeType: "image/png", value: base64(16) } },
			])
		)
		expect(blocks.some((b) => "text" in b)).toBe(true)
		expect(blocks.some((b) => "image" in b)).toBe(true)
	})
})

describe("parte de texto vazia", () => {
	/**
	 * O `throw` de parte não suportada existe para tipo que o adapter não sabe enviar. Texto
	 * vazio não é isso: o sisub grava resposta só com gráfico com conteúdo vazio e a reenvia
	 * como parte de texto vazia. Tratá-la como desconhecida derrubava a conversa ao reabrir.
	 */
	it("é ignorada, não tratada como parte desconhecida", () => {
		const soVazio = { role: "assistant", content: [{ type: "text", content: "" }] } as Parameters<typeof toBlocks>[0]
		const comTexto = {
			role: "assistant",
			content: [
				{ type: "text", content: "" },
				{ type: "text", content: "Segue." },
			],
		} as Parameters<typeof toBlocks>[0]
		expect(() => toBlocks(soVazio)).not.toThrow()
		expect(toBlocks(comTexto)).toEqual([{ text: "Segue." }])
	})
})
