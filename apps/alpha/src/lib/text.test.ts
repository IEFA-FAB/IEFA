import { describe, expect, test } from "bun:test"
import { cleanText, normalizeTitle, stripDiacritics } from "./text.ts"

describe("normalizeTitle", () => {
	test("remove numeração arábica e caixa", () => {
		expect(normalizeTitle("4 - DA JUSTIFICATIVA")).toBe("da justificativa")
		expect(normalizeTitle("4. Da Justificativa")).toBe("da justificativa")
		expect(normalizeTitle("1.3.2. Objeto")).toBe("objeto")
	})

	test("remove numeração romana só quando há separador", () => {
		expect(normalizeTitle("IV - Do objeto")).toBe("do objeto")
		expect(normalizeTitle("V) Da vigência")).toBe("da vigencia")
	})

	test("não confunde início de palavra com algarismo romano", () => {
		expect(normalizeTitle("CONDIÇÕES GERAIS DA CONTRATAÇÃO")).toBe("condicoes gerais da contratacao")
		expect(normalizeTitle("DO OBJETO")).toBe("do objeto")
		expect(normalizeTitle("CLÁUSULA DÉCIMA")).toBe("clausula decima")
		expect(normalizeTitle("MODELO DE TERMO DE REFERÊNCIA")).toBe("modelo de termo de referencia")
	})

	test("remove prefixo de artigo", () => {
		expect(normalizeTitle("Art. 3º Fica instituído")).toBe("fica instituido")
	})

	test("títulos equivalentes convergem para a mesma forma", () => {
		expect(normalizeTitle("4 - DA JUSTIFICATIVA")).toBe(normalizeTitle("4. Da Justificativa"))
	})

	test("remove pontuação final e espaço exótico", () => {
		expect(normalizeTitle("Do objeto.")).toBe("do objeto")
	})
})

describe("stripDiacritics", () => {
	test("preserva a caixa", () => {
		expect(stripDiacritics("CONTRATAÇÃO")).toBe("CONTRATACAO")
	})
})

describe("cleanText", () => {
	test("colapsa espaço exótico sem mexer em acento nem caixa", () => {
		expect(cleanText("Termo  de Referência ")).toBe("Termo de Referência")
	})
})
