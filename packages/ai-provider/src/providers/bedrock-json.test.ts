import { describe, expect, it } from "bun:test"
import { extractJsonObject } from "./bedrock.js"

describe("extractJsonObject", () => {
	it("lê JSON puro", () => {
		expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
	})

	it("lê JSON dentro de cerca markdown", () => {
		expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
	})

	// O caso que quebrava: o modelo fecha o objeto e emenda um comentário. Cortar
	// só a cerca final não resolvia, e a resposta inteira era descartada.
	it("ignora prosa depois do objeto", () => {
		expect(extractJsonObject('```json\n{"a":1}\n```\n\nObservação: revise o item 4.')).toEqual({ a: 1 })
	})

	it("ignora prosa antes do objeto", () => {
		expect(extractJsonObject('Segue a análise solicitada:\n{"a":1}')).toEqual({ a: 1 })
	})

	// Contar chaves sem respeitar aspas cortaria o objeto no meio de um texto que
	// contenha "}" — e as evidências do DGC citam subcentros e fórmulas.
	it("não se perde com chave dentro de string", () => {
		expect(extractJsonObject('{"evidencia":"subcentro {XX.YY.ZZ} irregular","ok":true}')).toEqual({
			evidencia: "subcentro {XX.YY.ZZ} irregular",
			ok: true,
		})
	})

	it("respeita aspas escapadas", () => {
		expect(extractJsonObject('{"t":"diz \\"}\\" aqui","n":2}')).toEqual({ t: 'diz "}" aqui', n: 2 })
	})

	it("lê objeto aninhado inteiro", () => {
		expect(extractJsonObject('{"a":{"b":{"c":1}},"d":2} sobra')).toEqual({ a: { b: { c: 1 } }, d: 2 })
	})

	it("devolve undefined sem objeto parseável", () => {
		expect(extractJsonObject("não há json aqui")).toBeUndefined()
		expect(extractJsonObject('{"a":')).toBeUndefined()
		expect(extractJsonObject("")).toBeUndefined()
	})
})
