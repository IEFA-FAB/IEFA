import { describe, expect, test } from "vitest"
import { buildSearchRegex, normalizeForSearch, stripAccents } from "./text-search"

const INSENSITIVE = { caseSensitive: false, accentSensitive: false }

describe("stripAccents", () => {
	test("remove diacríticos comuns do português", () => {
		expect(stripAccents("Feijão Tropeiro")).toBe("Feijao Tropeiro")
		expect(stripAccents("açúcar")).toBe("acucar")
		expect(stripAccents("pão-de-ló")).toBe("pao-de-lo")
	})

	test("não altera texto sem acentos", () => {
		expect(stripAccents("arroz")).toBe("arroz")
	})
})

describe("normalizeForSearch", () => {
	test("default (insensível) remove acento e caixa", () => {
		expect(normalizeForSearch("CAFÉ", INSENSITIVE)).toBe("cafe")
	})

	test("accentSensitive preserva acento mas ainda baixa a caixa", () => {
		expect(normalizeForSearch("CAFÉ", { caseSensitive: false, accentSensitive: true })).toBe("café")
	})

	test("caseSensitive preserva a caixa mas remove acento", () => {
		expect(normalizeForSearch("CAFÉ", { caseSensitive: true, accentSensitive: false })).toBe("CAFE")
	})

	test("totalmente sensível não altera nada", () => {
		expect(normalizeForSearch("CAFÉ", { caseSensitive: true, accentSensitive: true })).toBe("CAFÉ")
	})
})

describe("buildSearchRegex", () => {
	test("string de busca vazia devolve null", () => {
		expect(buildSearchRegex("", INSENSITIVE)).toBeNull()
	})

	test("insensível a acento casa termo digitado sem acento contra texto acentuado", () => {
		const re = buildSearchRegex("cafe", INSENSITIVE)
		expect(re).not.toBeNull()
		expect(re?.test("Bebida: Café com leite")).toBe(true)
	})

	test("insensível a acento também casa termo acentuado contra texto sem acento", () => {
		const re = buildSearchRegex("café", INSENSITIVE)
		expect(re?.test("cafe da manha")).toBe(true)
	})

	test("insensível a caixa casa qualquer capitalização", () => {
		const re = buildSearchRegex("ARROZ", INSENSITIVE)
		expect(re?.test("arroz branco")).toBe(true)
	})

	test("accentSensitive distingue acento", () => {
		const re = buildSearchRegex("café", { caseSensitive: false, accentSensitive: true })
		expect(re?.test("café")).toBe(true)
		// lastIndex é global; recriar para testar o negativo isoladamente
		const re2 = buildSearchRegex("café", { caseSensitive: false, accentSensitive: true })
		expect(re2?.test("cafe")).toBe(false)
	})

	test("caseSensitive distingue maiúsculas", () => {
		const re = buildSearchRegex("Arroz", { caseSensitive: true, accentSensitive: false })
		expect(re?.test("Arroz")).toBe(true)
		const re2 = buildSearchRegex("Arroz", { caseSensitive: true, accentSensitive: false })
		expect(re2?.test("arroz")).toBe(false)
	})

	test("wholeWord não casa substring dentro de outra palavra", () => {
		const re = buildSearchRegex("ovo", INSENSITIVE, true)
		expect(re?.test("gemada de ovo")).toBe(true)
		const re2 = buildSearchRegex("ovo", INSENSITIVE, true)
		expect(re2?.test("novo prato")).toBe(false)
	})

	test("caracteres especiais de regex são tratados literalmente", () => {
		const re = buildSearchRegex("1.5kg", INSENSITIVE)
		expect(re?.test("saco 1.5kg")).toBe(true)
		const re2 = buildSearchRegex("1.5kg", INSENSITIVE)
		// o ponto literal não deve casar um caractere qualquer
		expect(re2?.test("1x5kg")).toBe(false)
	})

	test("é usável em replace preservando posições do texto original", () => {
		const re = buildSearchRegex("cafe", INSENSITIVE)
		const out = "Café com leite".replace(re as RegExp, "Chá")
		expect(out).toBe("Chá com leite")
	})
})
