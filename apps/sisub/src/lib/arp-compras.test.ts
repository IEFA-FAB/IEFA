import { describe, expect, test } from "vitest"
import { anoFromNumeroAta, assertVigenciaWindow, defaultVigenciaWindow, formatNumeroAta, parseBrDate, parseNumeroItem } from "./arp-compras"

describe("formatNumeroAta", () => {
	// Verificado contra a API: só "00002/2025" retorna a ata; "2/2025" e "00002"
	// devolvem lista vazia porque o filtro é igualdade exata.
	test("preenche com zeros até 5 dígitos", () => {
		expect(formatNumeroAta("2", "2025")).toBe("00002/2025")
		expect(formatNumeroAta("94", "2025")).toBe("00094/2025")
	})

	test("não trunca número já preenchido", () => {
		expect(formatNumeroAta("00002", "2025")).toBe("00002/2025")
		expect(formatNumeroAta("123456", "2025")).toBe("123456/2025")
	})

	test("descarta o que não é dígito", () => {
		expect(formatNumeroAta(" 2 ", "2025")).toBe("00002/2025")
		expect(formatNumeroAta("nº 2", "2025")).toBe("00002/2025")
	})
})

describe("anoFromNumeroAta", () => {
	test("extrai o ano do número canônico", () => {
		expect(anoFromNumeroAta("00002/2025")).toBe("2025")
	})

	test("devolve null sem barra", () => {
		expect(anoFromNumeroAta("00002")).toBeNull()
	})
})

describe("assertVigenciaWindow", () => {
	// A API responde 400 acima de 365 dias; 365 exatos passam. O limite é
	// inclusivo, então o teste fixa os dois lados da fronteira.
	test("aceita exatamente 365 dias", () => {
		expect(() => assertVigenciaWindow("2025-09-11", "2026-09-11")).not.toThrow()
	})

	test("rejeita 366 dias", () => {
		expect(() => assertVigenciaWindow("2025-09-10", "2026-09-11")).toThrow(/no máximo 365 dias/)
	})

	test("rejeita janela invertida", () => {
		expect(() => assertVigenciaWindow("2026-01-10", "2026-01-01")).toThrow(/anterior à inicial/)
	})

	test("rejeita data ilegível", () => {
		expect(() => assertVigenciaWindow("ontem", "2026-01-01")).toThrow(/inválido/)
	})

	test("aceita janela de um dia (usada na importação de itens)", () => {
		expect(() => assertVigenciaWindow("2025-03-14", "2025-03-14")).not.toThrow()
	})
})

describe("defaultVigenciaWindow", () => {
	test("cabe no limite da API", () => {
		const { min, max } = defaultVigenciaWindow(new Date("2026-09-11T13:45:00Z"))
		expect(max).toBe("2026-09-11")
		expect(min).toBe("2025-09-11")
		expect(() => assertVigenciaWindow(min, max)).not.toThrow()
	})

	test("cabe no limite mesmo atravessando ano bissexto", () => {
		const { min, max } = defaultVigenciaWindow(new Date("2024-03-01T00:00:00Z"))
		expect(() => assertVigenciaWindow(min, max)).not.toThrow()
	})
})

describe("parseNumeroItem", () => {
	test("converte o zero-padded da API para o inteiro da coluna", () => {
		expect(parseNumeroItem("00017")).toBe(17)
		expect(parseNumeroItem("00002")).toBe(2)
	})

	test("devolve null para ausente ou não numérico", () => {
		expect(parseNumeroItem(null)).toBeNull()
		expect(parseNumeroItem(undefined)).toBeNull()
		expect(parseNumeroItem("item 1")).toBeNull()
	})
})

describe("parseBrDate", () => {
	test("converte DD/MM/YYYY para ISO", () => {
		expect(parseBrDate("14/03/2025")).toBe("2025-03-14")
	})

	test("trunca ISO com hora", () => {
		expect(parseBrDate("2025-03-14T00:00:00")).toBe("2025-03-14")
	})

	test("devolve null para vazio ou formato desconhecido", () => {
		expect(parseBrDate(null)).toBeNull()
		expect(parseBrDate("")).toBeNull()
		expect(parseBrDate("março de 2025")).toBeNull()
	})
})
