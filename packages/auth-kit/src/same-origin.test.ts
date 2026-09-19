import { describe, expect, it } from "bun:test"
import { checkSameOriginJsonRequest } from "./same-origin.ts"

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

	it("respeita o x-forwarded-host do ALB", () => {
		const h = new Headers({
			host: "10.0.0.1:3000",
			"x-forwarded-host": "sisub.iefa.com.br",
			"content-type": "application/json",
			origin: "https://sisub.iefa.com.br",
		})
		expect(checkSameOriginJsonRequest(h, URL_).ok).toBe(true)
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
