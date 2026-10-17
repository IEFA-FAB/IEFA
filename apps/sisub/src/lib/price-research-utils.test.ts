import { describe, expect, test, vi } from "vitest"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

// price-research-utils importa a server fn de busca; ela não é exercida por
// autoSelectPrice (função pura sobre resultados já carregados), então mockamos
// o módulo para evitar carregar o runtime de server function no teste.
vi.mock("@/server/price-research.fn", () => ({ searchMaterialPricesFn: vi.fn() }))

const {
	autoSelectPrice,
	chooseReferencePrice,
	fetchAllPagesForCatmat,
	filterByPeriod,
	isMethodAllowed,
	isSampleSelectable,
	MAX_PAGES,
	partitionByPeriod,
	periodCutoff,
	priceForMethod,
} = await import("./price-research-utils")
const { searchMaterialPricesFn } = await import("@/server/price-research.fn")

/** Data dentro da janela padrão contada de hoje: amostra sem data fica fora do cálculo. */
const RECENT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

function priceResult(
	precoUnitario: number | null,
	codigoUasg: string | null = null,
	dataResultado: string | null = RECENT,
	unit: Partial<Pick<ComprasMaterialPriceResult, "siglaUnidadeFornecimento" | "siglaUnidadeMedida" | "capacidadeUnidadeFornecimento">> = {}
): ComprasMaterialPriceResult {
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
		siglaUnidadeMedida: unit.siglaUnidadeMedida ?? null,
		nomeUnidadeFornecimento: null,
		siglaUnidadeFornecimento: unit.siglaUnidadeFornecimento ?? "KG",
		capacidadeUnidadeFornecimento: unit.capacidadeUnidadeFornecimento ?? null,
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

	test("distribuição homogênea (CV < 15) usa a média quando ela não passa da mediana", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(12), priceResult(12)])
		expect(r?.method).toBe("mean")
		expect(r?.price).toBeCloseTo(11.333, 2)
	})

	test("média acima da mediana cai na mediana (art. 6º, § 6º, da IN 65/2021)", () => {
		// CV < 15, mas a média (10,667) passa da mediana (10).
		const r = autoSelectPrice([priceResult(10), priceResult(10), priceResult(12)])
		expect(r?.method).toBe("median")
		expect(r?.price).toBe(10)
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

	test("amostra sem preço não entra em nenhuma lista nem vira outlier", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(11), priceResult(12), priceResult(13), priceResult(100), priceResult(null)])
		expect(r?.validSamples).toHaveLength(4)
		expect(r?.outlierSamples).toHaveLength(1) // 100
		expect(r?.inconsistentSamples).toHaveLength(0)
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

describe("unidade da pesquisa", () => {
	test("converte embalagens para a unidade do item antes da estatística", () => {
		// Mesmo produto em três embalagens: 750 ml, 500 ml e litro. Por litro, todos custam ~R$ 5,50.
		const r = autoSelectPrice(
			[
				priceResult(4.13, "A", undefined, { siglaUnidadeFornecimento: "FR", siglaUnidadeMedida: "ML", capacidadeUnidadeFornecimento: 750 }),
				priceResult(2.75, "B", undefined, { siglaUnidadeFornecimento: "FR", siglaUnidadeMedida: "ML", capacidadeUnidadeFornecimento: 500 }),
				priceResult(5.5, "C", undefined, { siglaUnidadeFornecimento: "L" }),
			],
			{ targetUnit: "LT", periodMonths: null }
		)
		expect(r?.unit).toBe("LT")
		expect(r?.unitInferred).toBe(false)
		expect(r?.stats.min).toBeCloseTo(5.5, 1)
		expect(r?.stats.max).toBeCloseTo(5.51, 1)
		expect(r?.validCount).toBe(3)
	})

	test("amostra incomparável sai como inconsistente, não como outlier", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(11), priceResult(12), priceResult(20.93, "X", undefined, { siglaUnidadeFornecimento: "UN" })], {
			targetUnit: "KG",
			periodMonths: null,
		})
		expect(r?.inconsistentSamples.map((s) => s.precoUnitario)).toEqual([20.93])
		expect(r?.validCount).toBe(3)
		expect(r?.outlierCount).toBe(0)
	})

	test("item sem unidade herda a predominante e marca a inferência", () => {
		const r = autoSelectPrice([priceResult(10), priceResult(11)], { targetUnit: null, periodMonths: null })
		expect(r?.unit).toBe("KG")
		expect(r?.unitInferred).toBe(true)
	})

	test("nenhuma amostra comparável devolve null", () => {
		expect(autoSelectPrice([priceResult(5, "A", undefined, { siglaUnidadeFornecimento: "UN" })], { targetUnit: "KG", periodMonths: null })).toBeNull()
	})
})

describe("teto da mediana", () => {
	test("chooseReferencePrice nunca devolve valor acima da mediana", () => {
		expect(chooseReferencePrice({ mean: 11, median: 10, cv: 5 })).toEqual({ method: "median", price: 10 })
		expect(chooseReferencePrice({ mean: 9, median: 10, cv: 5 })).toEqual({ method: "mean", price: 9 })
		expect(chooseReferencePrice({ mean: 9, median: 10, cv: 40 })).toEqual({ method: "median", price: 10 })
	})

	test("isMethodAllowed recusa a média acima da mediana", () => {
		expect(isMethodAllowed("mean", { mean: 11, median: 10 })).toBe(false)
		expect(isMethodAllowed("mean", { mean: 10, median: 10 })).toBe(true)
		expect(isMethodAllowed("median", { mean: 11, median: 10 })).toBe(true)
	})

	test("menor valor é método do art. 6º, caput, e nunca passa da mediana", () => {
		expect(isMethodAllowed("lowest", { mean: 11, median: 10 })).toBe(true)
		expect(priceForMethod("lowest", { mean: 11, median: 10, min: 8 })).toBe(8)
		expect(priceForMethod("mean", { mean: 11, median: 10, min: 8 })).toBe(11)
		expect(priceForMethod("median", { mean: 11, median: 10, min: 8 })).toBe(10)
	})
})

describe("janela de recência", () => {
	const NOW = new Date("2026-07-28T12:00:00Z")

	test("periodCutoff volta os meses pedidos", () => {
		expect(periodCutoff(12, NOW)).toBe("2025-07-28")
		expect(periodCutoff(6, NOW)).toBe("2026-01-28")
	})

	test("filterByPeriod descarta amostras antigas e, por padrão, as sem data", () => {
		const recente = priceResult(10, "A", "2026-06-01")
		const antiga = priceResult(99, "B", "2020-01-01")
		const semData = priceResult(11, "C", null)
		expect(filterByPeriod([recente, antiga, semData], 12, NOW)).toEqual([recente])
	})

	test("filterByPeriod inclui a sem data só quando pedido, na ordem original", () => {
		const semData = priceResult(11, "C", null)
		const recente = priceResult(10, "A", "2026-06-01")
		const antiga = priceResult(99, "B", "2020-01-01")
		expect(filterByPeriod([semData, recente, antiga], 12, NOW, { includeUndated: true })).toEqual([semData, recente])
	})

	test("sem janela, a sem data continua fora do cálculo", () => {
		const semData = priceResult(11, "C", null)
		const antiga = priceResult(99, "B", "2020-01-01")
		expect(filterByPeriod([semData, antiga], null, NOW)).toEqual([antiga])
	})

	test("partitionByPeriod separa na janela, fora dela e sem data, num passe", () => {
		const recente = priceResult(10, "A", "2026-06-01")
		const antiga = priceResult(99, "B", "2020-01-01")
		const semData = priceResult(11, "C", null)
		expect(partitionByPeriod([semData, recente, antiga], 12, NOW)).toEqual({
			inWindow: [recente],
			outOfWindow: [antiga],
			undated: [semData],
			// O que a tabela mostra, na ordem original.
			visible: [semData, recente],
		})
	})

	test("sem data só é selecionável depois de incluída ('Selecionar todos' não a põe no cálculo)", () => {
		const semData = priceResult(11, "C", null)
		const recente = priceResult(10, "A", "2026-06-01")
		expect(isSampleSelectable(semData, false)).toBe(false)
		expect(isSampleSelectable(semData, true)).toBe(true)
		expect(isSampleSelectable(recente, false)).toBe(true)
	})

	test("autoSelectPrice deixa a amostra sem data fora do cálculo e a conta no funil", () => {
		const r = autoSelectPrice([priceResult(10, "A", "2026-06-01"), priceResult(12, "B", "2026-05-01"), priceResult(1, "C", null)], {
			periodMonths: 12,
			now: NOW,
		})
		expect(r?.validCount).toBe(2)
		expect(r?.undatedCount).toBe(1)
		expect(r?.stats.min).toBe(10)
	})

	test("autoSelectPrice só com amostras sem data não estima preço", () => {
		expect(autoSelectPrice([priceResult(10, "A", null), priceResult(11, "B", null)], { periodMonths: 12, now: NOW })).toBeNull()
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

describe("fetchAllPagesForCatmat", () => {
	const FETCHED_AT = "2026-10-16T14:59:58.000Z"

	/** Fonte simulada: `dates` em ordem decrescente, `perPage` por página, como a API devolve. */
	function mockSource(dates: Array<string | null>, perPage: number) {
		const totalPaginas = Math.ceil(dates.length / perPage)
		const requested: number[] = []
		vi.mocked(searchMaterialPricesFn).mockImplementation((async ({ data }: { data: { pagina: number } }) => {
			requested.push(data.pagina)
			const slice = dates.slice((data.pagina - 1) * perPage, data.pagina * perPage)
			return {
				resultado: slice.map((d) => priceResult(10, "1", d)),
				totalRegistros: dates.length,
				totalPaginas,
				paginasRestantes: Math.max(0, totalPaginas - data.pagina),
				dataHoraConsulta: null,
				timeZoneAtual: null,
				fetchedAt: FETCHED_AT,
			}
		}) as never)
		return requested
	}

	/** Uma data por dia, da mais nova para a mais antiga, a partir de `from`. */
	const days = (from: string, count: number) =>
		Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10))

	test("com janela, para na primeira página que passa do início dela e confere a última", async () => {
		// 3 anos de um preço por dia, 10 por página: a janela de 12 meses cabe nas ~37 primeiras páginas.
		const all = days("2026-10-15", 1100)
		const requested = mockSource(all, 10)
		const fetched = await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(fetched.source).toMatchObject({
			consultedAt: FETCHED_AT,
			query: "tipo=codigoItemCatalogo&codigo=1&tamanhoPagina=500",
			totalRecords: 1100,
			totalPages: 110,
			coverage: "window",
		})
		expect(fetched.source.pagesFetched).toBeLessThan(45)
		// a janela inteira veio: nenhuma data da janela ficou de fora
		const cutoff = periodCutoff(12, new Date(FETCHED_AT))
		expect(fetched.results.filter((r) => (r.dataResultado as string) >= cutoff)).toHaveLength(all.filter((d) => d >= cutoff).length)
		expect(requested).toContain(110)
	})

	test("linha sem data do resultado no fim da fonte faz ler tudo", async () => {
		mockSource([...days("2026-10-15", 395), null, null, null, null, null], 10)
		const fetched = await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(fetched.source.coverage).toBe("complete")
		expect(fetched.results).toHaveLength(400)
	})

	test("linha da janela no fim da fonte (sem data do resultado, com data da compra) faz ler tudo", async () => {
		mockSource([...days("2026-10-15", 395), null, null, null, null, null], 10)
		vi.mocked(searchMaterialPricesFn).mockImplementation((async ({ data }: { data: { pagina: number } }) => {
			const all = [
				...days("2026-10-15", 395).map((d) => priceResult(10, "1", d)),
				...Array.from({ length: 5 }, () => ({ ...priceResult(10, "1", null), dataCompra: "2026-10-01" })),
			]
			return {
				resultado: all.slice((data.pagina - 1) * 10, data.pagina * 10),
				totalRegistros: 400,
				totalPaginas: 40,
				paginasRestantes: 0,
				dataHoraConsulta: null,
				timeZoneAtual: null,
				fetchedAt: FETCHED_AT,
			}
		}) as never)
		const fetched = await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(fetched.source.coverage).toBe("complete")
		expect(fetched.results).toHaveLength(400)
	})

	test("fonte fora de ordem faz ler tudo", async () => {
		const dates = days("2026-10-15", 60)
		dates.splice(5, 0, "2026-12-01")
		mockSource(dates, 10)
		expect((await fetchAllPagesForCatmat(1, { periodMonths: 1, pauseMs: 0 })).source.coverage).toBe("complete")
	})

	test("sem janela lê todas as páginas; acima do teto, a coleta é parcial", async () => {
		mockSource(days("2026-10-15", 30), 10)
		expect((await fetchAllPagesForCatmat(1, { periodMonths: null, pauseMs: 0 })).source.coverage).toBe("complete")
		mockSource(days("2026-10-15", (MAX_PAGES + 2) * 10), 10)
		const partial = await fetchAllPagesForCatmat(1, { periodMonths: null, pauseMs: 0 })
		expect(partial.source).toMatchObject({ coverage: "truncated", pagesFetched: MAX_PAGES, totalPages: MAX_PAGES + 2 })
		expect(partial.orderBroken).toBe(false)
	})

	test("janela maior que o teto curto ainda é lida inteira (o teto com janela é o largo)", async () => {
		// 5 linhas por dia, 10 por página: a janela de 12 meses ocupa ~180 páginas
		const dates = days("2026-10-15", 500).flatMap((d) => [d, d, d, d, d])
		mockSource(dates, 10)
		const fetched = await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(fetched.source.coverage).toBe("window")
		expect(fetched.source.pagesFetched).toBeGreaterThan(MAX_PAGES)
	})

	test("fonte fora de ordem com janela lê tudo pelo teto largo, sem cortar a janela", async () => {
		const dates: Array<string | null> = days("2026-10-15", 600)
		dates[300] = null
		mockSource(dates, 10)
		const fetched = await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(fetched.source).toMatchObject({ coverage: "complete", pagesFetched: 60 })
		expect(fetched.orderBroken).toBe(true)
	})

	test("a última página lida como conferência é reaproveitada na leitura completa", async () => {
		const requested = mockSource([...days("2026-10-15", 395), null], 10)
		await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })
		expect(requested.filter((p) => p === 40)).toHaveLength(1)
	})

	test("última página com data mais nova que a última lida faz ler tudo", async () => {
		const dates = days("2026-10-15", 400)
		dates[399] = "2026-10-10"
		mockSource(dates, 10)
		expect((await fetchAllPagesForCatmat(1, { periodMonths: 12, pauseMs: 0 })).source.coverage).toBe("complete")
	})
})
