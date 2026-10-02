import { describe, expect, test } from "vitest"
import { classifyChatLink, MAX_SHOWN_URL_CHARS, shownUrl } from "./chat-links"

const ORIGIN = "https://sisub.example"

describe("classifyChatLink", () => {
	test("caminho do app é interno", () => {
		expect(classifyChatLink("/kitchen/7/planning", ORIGIN)).toEqual({ kind: "internal", href: "/kitchen/7/planning" })
		expect(classifyChatLink("#resumo", ORIGIN)).toEqual({ kind: "internal", href: "#resumo" })
	})

	test("URL absoluta do mesmo origin é interna", () => {
		expect(classifyChatLink("https://sisub.example/analytics", ORIGIN)).toEqual({ kind: "internal", href: "https://sisub.example/analytics" })
	})

	test("outro domínio é externo, com o host de verdade", () => {
		expect(classifyChatLink("https://evil.example:8443/x?d=1", ORIGIN)).toEqual({
			kind: "external",
			href: "https://evil.example:8443/x?d=1",
			host: "evil.example:8443",
		})
		// Subdomínio parecido não é o app.
		expect(classifyChatLink("https://sisub.example.evil.test/x", ORIGIN)).toMatchObject({ kind: "external", host: "sisub.example.evil.test" })
		// Userinfo não engana: o host é o que vem depois do @.
		expect(classifyChatLink("https://sisub.example@evil.example/x", ORIGIN)).toMatchObject({ kind: "external", host: "evil.example" })
	})

	test("sem origin (servidor), todo absoluto é externo", () => {
		expect(classifyChatLink("https://sisub.example/analytics")).toMatchObject({ kind: "external" })
	})

	test("protocolo-relativo, barra invertida e esquema fora de http(s) não viram link", () => {
		for (const href of [
			"//evil.example/x",
			"/\\evil.example/x",
			"javascript:alert(1)",
			"data:text/html,oi",
			"mailto:a@b.c",
			"ftp://x/y",
			"",
			"   ",
			42,
			undefined,
		]) {
			expect(classifyChatLink(href, ORIGIN)).toEqual({ kind: "blocked" })
		}
	})
})

describe("shownUrl", () => {
	test("corta no teto", () => {
		const long = `https://evil.example/?d=${"a".repeat(1000)}`
		expect(shownUrl(long)).toHaveLength(MAX_SHOWN_URL_CHARS + 1)
		expect(shownUrl("https://x.example/")).toBe("https://x.example/")
	})
})
