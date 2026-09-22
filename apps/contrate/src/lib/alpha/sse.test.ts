import { describe, expect, it } from "bun:test"
import { parseSseBuffer } from "./sse"

describe("parseSseBuffer", () => {
	it("separa eventos completos e devolve o resto incompleto", () => {
		const { events, rest } = parseSseBuffer('event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"te')
		expect(events).toEqual([{ event: "delta", data: '{"text":"a"}' }])
		expect(rest).toBe('event: delta\ndata: {"te')
	})

	it("ignora o comentário de keep-alive", () => {
		expect(parseSseBuffer(": keep-alive\n\n").events).toEqual([])
	})

	it("junta data em várias linhas e aceita CRLF", () => {
		expect(parseSseBuffer("event: complete\r\ndata: a\r\ndata: b\r\n\r\n").events).toEqual([{ event: "complete", data: "a\nb" }])
	})

	it("evento sem nome é message", () => {
		expect(parseSseBuffer("data: x\n\n").events).toEqual([{ event: "message", data: "x" }])
	})
})
