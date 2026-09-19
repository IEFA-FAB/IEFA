import { describe, expect, it } from "bun:test"
import { checkSameOriginJsonRequest, isRequestOrigin } from "./same-origin.ts"

const URL_ = "http://sisub.iefa.com.br/api/module-chat/stream"

function headers(init: Record<string, string>) {
	return new Headers({ host: "sisub.iefa.com.br", ...init })
}

describe("checkSameOriginJsonRequest (guard de CSRF)", () => {
	it("aceita JSON da mesma origem", () => {
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json", origin: "https://sisub.iefa.com.br" }), URL_).ok).toBe(true)
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json; charset=utf-8", referer: "https://sisub.iefa.com.br/hub" }), URL_).ok).toBe(
			true
		)
	})

	it("ignora o x-forwarded-host (o ALB repassa o valor que o cliente mandou)", () => {
		const h = new Headers({
			host: "sisub.iefa.com.br",
			"x-forwarded-host": "evil.com",
			"content-type": "application/json",
			origin: "https://evil.com",
		})
		expect(checkSameOriginJsonRequest(h, URL_).ok).toBe(false)
	})

	it("recusa text/plain (o POST cross-site sem preflight)", () => {
		expect(checkSameOriginJsonRequest(headers({ "content-type": "text/plain", origin: "https://sisub.iefa.com.br" }), URL_).ok).toBe(false)
		expect(checkSameOriginJsonRequest(headers({ origin: "https://sisub.iefa.com.br" }), URL_).ok).toBe(false)
	})

	it("recusa outro subdomínio do mesmo site", () => {
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json", origin: "https://portal.iefa.com.br" }), URL_).ok).toBe(false)
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json", origin: "https://sisub.iefa.com.br.evil.com" }), URL_).ok).toBe(false)
	})

	it("recusa request sem Origin nem Referer, e Origin opaca", () => {
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json" }), URL_).ok).toBe(false)
		expect(checkSameOriginJsonRequest(headers({ "content-type": "application/json", origin: "null" }), URL_).ok).toBe(false)
	})
})

describe("isRequestOrigin (matcher do createCsrfMiddleware)", () => {
	it("compara pelo host, ignorando o http do request atrás do ALB", () => {
		const h = new Headers({ host: "sisub.iefa.com.br" })
		expect(isRequestOrigin("https://sisub.iefa.com.br", h, "http://sisub.iefa.com.br/_serverFn/x")).toBe(true)
		expect(isRequestOrigin("https://portal.iefa.com.br", h, "http://sisub.iefa.com.br/_serverFn/x")).toBe(false)
		expect(isRequestOrigin("null", h, "http://sisub.iefa.com.br/_serverFn/x")).toBe(false)
		expect(isRequestOrigin(undefined, h, "http://sisub.iefa.com.br/_serverFn/x")).toBe(false)
	})
})
