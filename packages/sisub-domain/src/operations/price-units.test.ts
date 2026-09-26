import { describe, expect, test } from "bun:test"
import { convertSamplePrice, parseMeasureUnit, resolveResearchUnit } from "./price-units.ts"

describe("parseMeasureUnit", () => {
	test("reconhece siglas livres do catálogo, sem caixa nem acento", () => {
		expect(parseMeasureUnit("kg")?.toBase).toBe(1)
		expect(parseMeasureUnit("Kg")?.dimension).toBe("mass")
		expect(parseMeasureUnit("LT")?.base).toBe("L")
		expect(parseMeasureUnit("unidade")?.dimension).toBe("count")
		expect(parseMeasureUnit("Dúzia")?.toBase).toBe(12)
	})

	test("unidade que não mede nada devolve null", () => {
		expect(parseMeasureUnit("PCT")).toBeNull()
		expect(parseMeasureUnit("EMB")).toBeNull()
		expect(parseMeasureUnit(null)).toBeNull()
	})
})

describe("convertSamplePrice", () => {
	test("embalagem com capacidade vira preço por unidade do item", () => {
		// Garrafa de 750 ml a R$ 4,17 custa R$ 5,56 o litro.
		const result = convertSamplePrice(
			{ precoUnitario: 4.17, capacidadeUnidadeFornecimento: 750, siglaUnidadeFornecimento: "FR", siglaUnidadeMedida: "ML" },
			"LT"
		)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.price).toBeCloseTo(5.56, 2)
			expect(result.contentInTarget).toBeCloseTo(0.75, 6)
			expect(result.explanation).toBe("FR 750 ML = 0,75 LT")
		}
	})

	test("embalagem de gramas para item em quilo", () => {
		const result = convertSamplePrice(
			{ precoUnitario: 3.97, capacidadeUnidadeFornecimento: 400, siglaUnidadeFornecimento: "PCT", siglaUnidadeMedida: "G" },
			"KG"
		)
		expect(result.ok && result.price).toBeCloseTo(9.925, 3)
	})

	test("fornecimento já na unidade (KG sem capacidade) não muda o preço", () => {
		const result = convertSamplePrice({ precoUnitario: 31.42, capacidadeUnidadeFornecimento: 0, siglaUnidadeFornecimento: "KG" }, "KG")
		expect(result.ok && result.price).toBe(31.42)
	})

	test("item em gramas recebe o preço por grama", () => {
		const result = convertSamplePrice({ precoUnitario: 10, capacidadeUnidadeFornecimento: 1, siglaUnidadeFornecimento: "EMB", siglaUnidadeMedida: "KG" }, "G")
		expect(result.ok && result.price).toBeCloseTo(0.01, 6)
	})

	test("UN sem conteúdo para item vendido a quilo é inconsistente", () => {
		const result = convertSamplePrice({ precoUnitario: 20.93, capacidadeUnidadeFornecimento: 0, siglaUnidadeFornecimento: "UN" }, "KG")
		expect(result).toEqual({ ok: false, reason: "incompatible_unit" })
	})

	test("embalagem sem capacidade nem unidade mensurável é inconsistente", () => {
		const result = convertSamplePrice({ precoUnitario: 5, capacidadeUnidadeFornecimento: 0, siglaUnidadeFornecimento: "EMB" }, "KG")
		expect(result).toEqual({ ok: false, reason: "unknown_sample_unit" })
	})

	test("amostra sem preço e item sem unidade reconhecida", () => {
		expect(convertSamplePrice({ precoUnitario: null, siglaUnidadeFornecimento: "KG" }, "KG")).toEqual({ ok: false, reason: "no_price" })
		expect(convertSamplePrice({ precoUnitario: 1, siglaUnidadeFornecimento: "KG" }, "PCT")).toEqual({ ok: false, reason: "unknown_target_unit" })
	})
})

describe("resolveResearchUnit", () => {
	test("usa a unidade do item quando ela é reconhecida", () => {
		expect(resolveResearchUnit("kg", [])).toEqual({ unit: "KG", inferred: false })
	})

	test("item sem unidade herda a predominante das amostras, marcada como inferida", () => {
		const samples = [
			{ precoUnitario: 1, capacidadeUnidadeFornecimento: 750, siglaUnidadeFornecimento: "FR", siglaUnidadeMedida: "ML" },
			{ precoUnitario: 1, siglaUnidadeFornecimento: "L" },
			{ precoUnitario: 1, siglaUnidadeFornecimento: "UN" },
		]
		expect(resolveResearchUnit(null, samples)).toEqual({ unit: "L", inferred: true })
	})

	test("sem unidade no item nem amostra mensurável, não há unidade", () => {
		expect(resolveResearchUnit(null, [{ precoUnitario: 1, siglaUnidadeFornecimento: "EMB" }])).toBeNull()
	})
})
