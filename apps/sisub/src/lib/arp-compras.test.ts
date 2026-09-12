import { describe, expect, test } from "vitest"
import { anoFromNumeroAta, assertVigenciaWindow, defaultVigenciaWindow, formatNumeroAta, parseBrDate, parseNumeroItem, resolveArpSaldos } from "./arp-compras"

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

describe("resolveArpSaldos", () => {
	test("indexa pelo número do item, convertendo o zero-padded", () => {
		const m = resolveArpSaldos([{ numeroItem: "00017", tipo: "GERENCIADORA", quantidadeRegistrada: 10, quantidadeEmpenhada: 5, saldoEmpenho: 5 }])
		expect(m.get(17)).toEqual({ quantidadeEmpenhada: 5, saldoEmpenho: 5 })
	})

	// Saldo zero é informação, não ausência: um `??` sobre o valor resolvido
	// transformaria "tudo empenhado" em "saldo cheio".
	test("preserva saldo zero", () => {
		const m = resolveArpSaldos([{ numeroItem: "00022", tipo: "GERENCIADORA", quantidadeRegistrada: 100, quantidadeEmpenhada: 100, saldoEmpenho: 0 }])
		expect(m.get(22)).toEqual({ quantidadeEmpenhada: 100, saldoEmpenho: 0 })
	})

	// A linha só existe porque HÁ empenho — saldo ausente nela não é saldo cheio.
	test("deriva o saldo de registrada − empenhada quando a API não manda", () => {
		const m = resolveArpSaldos([{ numeroItem: "00030", tipo: "GERENCIADORA", quantidadeRegistrada: 96, quantidadeEmpenhada: 60, saldoEmpenho: null }])
		expect(m.get(30)).toEqual({ quantidadeEmpenhada: 60, saldoEmpenho: 36 })
	})

	test("sem registrada e sem saldo, devolve null em vez de inventar", () => {
		const m = resolveArpSaldos([{ numeroItem: "00031", tipo: "GERENCIADORA", quantidadeEmpenhada: 7 }])
		expect(m.get(31)).toEqual({ quantidadeEmpenhada: 7, saldoEmpenho: null })
	})

	test("a linha da GERENCIADORA vence a do participante, em qualquer ordem", () => {
		const participante = { numeroItem: "00040", tipo: "PARTICIPANTE", quantidadeRegistrada: 50, quantidadeEmpenhada: 1, saldoEmpenho: 49 }
		const gerenciadora = { numeroItem: "00040", tipo: "GERENCIADORA", quantidadeRegistrada: 200, quantidadeEmpenhada: 80, saldoEmpenho: 120 }
		expect(resolveArpSaldos([participante, gerenciadora]).get(40)).toEqual({ quantidadeEmpenhada: 80, saldoEmpenho: 120 })
		expect(resolveArpSaldos([gerenciadora, participante]).get(40)).toEqual({ quantidadeEmpenhada: 80, saldoEmpenho: 120 })
	})

	test("item sem empenho simplesmente não está no mapa", () => {
		expect(resolveArpSaldos([]).size).toBe(0)
		expect(resolveArpSaldos([{ numeroItem: "00017", tipo: "GERENCIADORA" }]).has(33)).toBe(false)
	})

	test("linha sem número utilizável é descartada", () => {
		expect(resolveArpSaldos([{ numeroItem: null }, { numeroItem: "item 1" }]).size).toBe(0)
	})
})
