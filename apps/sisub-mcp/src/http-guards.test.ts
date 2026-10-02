import { describe, expect, test } from "bun:test"
import type { IncomingMessage } from "node:http"
import { PassThrough } from "node:stream"
import { BodyTooLargeError, clientIpFrom, countUserSessions, readBodyCapped, SECURITY_HEADERS } from "./http-guards.ts"

describe("clientIpFrom", () => {
	test("usa o ÚLTIMO hop do X-Forwarded-For — o que o ALB acrescenta", () => {
		// O cliente escreve "1.2.3.4"; o ALB acrescenta o endereço real no fim.
		expect(clientIpFrom("1.2.3.4, 203.0.113.9", "10.0.0.1")).toBe("203.0.113.9")
	})

	test("trocar o primeiro item não muda a chave do rate limit", () => {
		expect(clientIpFrom("9.9.9.9, 203.0.113.9", "10.0.0.1")).toBe(clientIpFrom("8.8.8.8, 203.0.113.9", "10.0.0.1"))
	})

	test("sem cabeçalho, vale o socket", () => {
		expect(clientIpFrom(undefined, "10.0.0.1")).toBe("10.0.0.1")
		expect(clientIpFrom(" , ", "10.0.0.1")).toBe("10.0.0.1")
	})
})

function fakeReq(chunks: string[], headers: Record<string, string> = {}): IncomingMessage {
	const stream = new PassThrough()
	Object.assign(stream, { headers })
	queueMicrotask(() => {
		for (const c of chunks) stream.write(c)
		stream.end()
	})
	return stream as unknown as IncomingMessage
}

describe("readBodyCapped", () => {
	test("lê corpo dentro do teto", async () => {
		expect(await readBodyCapped(fakeReq(['{"a":', "1}"]), 100)).toBe('{"a":1}')
	})

	test("recusa pelo Content-Length declarado", async () => {
		await expect(readBodyCapped(fakeReq(["x"], { "content-length": "5000" }), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
	})

	test("recusa corpo chunked que passa do teto", async () => {
		await expect(readBodyCapped(fakeReq(["x".repeat(60), "x".repeat(60)]), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
	})
})

test("countUserSessions conta só as do usuário", () => {
	expect(countUserSessions([{ userId: "a" }, { userId: "b" }, { userId: "a" }], "a")).toBe(2)
})

describe("SECURITY_HEADERS", () => {
	test("HSTS, nosniff, frame-options e referrer, sem tocar nos cabeçalhos de CORS", () => {
		expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=")
		expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff")
		expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY")
		expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer")
		expect(Object.keys(SECURITY_HEADERS).some((name) => name.toLowerCase().startsWith("access-control-"))).toBe(false)
	})
})
