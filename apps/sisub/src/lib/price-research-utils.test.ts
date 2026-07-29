import { describe, expect, test, vi } from "vitest"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

// price-research-utils importa a server fn de busca; ela não é exercida por
// autoSelectPrice (função pura sobre resultados já carregados), então mockamos
// o módulo para evitar carregar o runtime de server function no teste.
vi.mock("@/server/price-research.fn", () => ({ searchMaterialPricesFn: vi.fn() }))

const { autoSelectPrice, filterByPeriod, periodCutoff } = await import("./price-research-utils")

function priceResult(precoUnitario: number | null, codigoUasg: string | null = null, dataResultado: string | null = null): ComprasMaterialPriceResult {
	return {
		idCompra: "c",
		idItemCompra: 1,
		forma: null,
		modalidade: null,
		criterioJulgamento: null,
		numeroItemCompra: null,
		descricaoItem: null,
		codigoItemCatalogo: null,
		nomeUnidadeMedida: null,
		siglaUnidadeMedida: null,
		nomeUnidadeFornecimento: null,
		siglaUnidadeFornecimento: null,
		capacidadeUnidadeFornecimento: null,
		quantidade: null,
		precoUnitario,
		percentualMaiorDesconto: null,
		niFornecedor: null,
		nomeFornecedor: null,
		marca: null,
		codigoUasg,
		nomeUasg: null,
		codigoMunicipio: null,
		municipio: null,
		estado: null,
		codigoOrgao: null,
		nomeOrgao: null,
		dataCompra: null,
		dataResultado,
	}
}

describe("autoSelectPrice", () => {
	test("sem resultados devolve null", () => {
		expect(autoSelectPrice([])).toBeNull()
	})

	test("todos os preços nulos devolve null", () => {
		expect(autoSelectPrice([priceResult(null), priceResult(null)])).toBeNull()
	})

	test("distribuição homogênea (CV < 15) usa a média — IN SEGES 65/2021 Art. 5º", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(10), priceResult(12)])
		expect(r?.method).toBe("mean")
		expect(r?.price).toBeCloseTo(10.667, 2)
	})

	test("distribuição heterogênea (CV ≥ 15) usa a mediana", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(10), priceResult(20)])
		expect(r?.method).toBe("median")
		expect(r?.price).toBe(10)
	})

	test("menos de 4 amostras não aplica filtro de outliers", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(1000), priceResult(20)])
		expect(r?.outlierCount).toBe(0)
		expect(r?.validCount).toBe(3)
		expect(r?.outlierSamples).toEqual([])
	})

	test("remove outliers por IQR (1.5×) com 4+ amostras", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(11), priceResult(12), priceResult(13), priceResult(100)])
		expect(r?.rawCount).toBe(5)
		expect(r?.validCount).toBe(4)
		expect(r?.outlierCount).toBe(1)
		expect(r?.outlierSamples.map((s) => s.precoUnitario)).toEqual([100])
		// stats calculadas apenas sobre os valores válidos
		expect(r?.stats.min).toBe(10)
		expect(r?.stats.max).toBe(13)
		expect(r?.method).toBe("mean")
		expect(r?.price).toBe(11.5)
	})

	test("IQR zero (valores idênticos) não descarta nada e cai na média", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(10), priceResult(10), priceResult(10)])
		expect(r?.outlierCount).toBe(0)
		expect(r?.stats.cv).toBe(0)
		expect(r?.method).toBe("mean")
		expect(r?.price).toBe(10)
	})

	test("amostras de preço nulo permanecem em validSamples e não viram outlier", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(11), priceResult(12), priceResult(13), priceResult(100), priceResult(null)])
		expect(r?.validSamples).toHaveLength(5) // 10,11,12,13 e o nulo
		expect(r?.outlierSamples).toHaveLength(1) // 100
		// rawCount = preços não-nulos (10,11,12,13,100); validCount exclui o outlier 100
		expect(r?.rawCount).toBe(5)
		expect(r?.validCount).toBe(4)
		expect(r?.outlierCount).toBe(1)
	})

	test("uniqueSources conta UASGs distintas e ignora nulos", () => {
		const r = autoSelectPrice([priceResult(10, "A"), priceResult(11, "A"), priceResult(12, "B"), priceResult(13, null)])
		expect(r?.stats.uniqueSources).toBe(2)
	})

	test("uniqueSources ignora UASGs que só aparecem em outliers", () => {
		// C só sustenta a amostra descartada pelo IQR — não pode contar como fonte
		// para o critério de conformidade (≥ 3 UASGs).
		const r = autoSelectPrice([priceResult(10, "A"), priceResult(11, "A"), priceResult(12, "B"), priceResult(13, "B"), priceResult(1000, "C")])
		expect(r?.outlierCount).toBe(1)
		expect(r?.stats.uniqueSources).toBe(2)
	})
})

describe("janela de recência", () => {
	const NOW = new Date("2026-07-28T12:00:00Z")

	test("periodCutoff volta os meses pedidos", () => {
		expect(periodCutoff(12, NOW)).toBe("2025-07-28")
		expect(periodCutoff(6, NOW)).toBe("2026-01-28")
	})

	test("filterByPeriod descarta amostras antigas e mantém as sem data", () => {
		const recente = priceResult(10, "A", "2026-06-01")
		const antiga = priceResult(99, "B", "2020-01-01")
		const semData = priceResult(11, "C", null)
		expect(filterByPeriod([recente, antiga, semData], 12, NOW)).toEqual([recente, semData])
	})

	test("autoSelectPrice aplica a janela padrão e registra o funil", () => {
		const antiga = priceResult(1000, "Z", "2015-01-01")
		const r = autoSelectPrice([priceResult(10, "A", "2026-06-01"), priceResult(12, "B", "2026-05-01"), antiga], { periodMonths: 12, now: NOW })
		// rawCount = tudo que veio da API com preço; dateFilteredCount = pós-janela
		expect(r?.rawCount).toBe(3)
		expect(r?.dateFilteredCount).toBe(2)
		expect(r?.periodMonths).toBe(12)
		expect(r?.validSamples).toHaveLength(2)
		expect(r?.stats.max).toBe(12)
	})

	test("periodMonths null considera todo o histórico", () => {
		const r = autoSelectPrice([priceResult(10, "A", "2026-06-01"), priceResult(20, "B", "2015-01-01")], { periodMonths: null })
		expect(r?.dateFilteredCount).toBe(2)
		expect(r?.periodMonths).toBeNull()
		expect(r?.stats.max).toBe(20)
	})
})
