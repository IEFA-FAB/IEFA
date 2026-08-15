import { describe, expect, it } from "bun:test"

import { parseCookieHeader } from "./cookie-auth-client.ts"

describe("parseCookieHeader", () => {
	it("devolve lista vazia sem header — request sem sessão, não erro", () => {
		expect(parseCookieHeader(undefined)).toEqual([])
		expect(parseCookieHeader("")).toEqual([])
	})

	it("separa os pares e tira o espaço depois do ponto e vírgula", () => {
		expect(parseCookieHeader("a=1; b=2")).toEqual([
			{ name: "a", value: "1" },
			{ name: "b", value: "2" },
		])
	})

	// O caso que faz a sessão sumir se o parser estiver errado: cookie do Supabase é
	// JWT em base64, que carrega `=` de padding e mais `=` dentro do próprio valor.
	it("preserva os `=` do valor — truncar aqui invalida o JWT da sessão", () => {
		const jwt = "base64-eyJhbGciOiJIUzI1NiJ9.payload=="
		const parsed = parseCookieHeader(`sb-abc-auth-token.0=${jwt}`)
		expect(parsed).toEqual([{ name: "sb-abc-auth-token.0", value: jwt }])
	})

	it("descarta segmento vazio — header terminado em `;` não vira par sem nome", () => {
		expect(parseCookieHeader("a=1;")).toEqual([{ name: "a", value: "1" }])
		expect(parseCookieHeader("; ;")).toEqual([])
	})

	it("mantém cookie sem valor como string vazia", () => {
		expect(parseCookieHeader("flag=")).toEqual([{ name: "flag", value: "" }])
	})
})
