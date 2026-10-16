import type { ResearchFinding } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"
import {
	BRL,
	computeVirtualPadding,
	createPriceRowIdResolver,
	formatCapacityLabel,
	formatDate,
	formatMunicipalityLabel,
	formatPeriodLabel,
	formatResultsCount,
	formatSampleScopeLabel,
	formatUndatedLabel,
	getIncomparableSuffix,
	getMeanPriceTitle,
	getRecommendation,
	getUsePriceLabel,
	groupFindings,
	hasLoadedResults,
	hasReferenceDate,
	NUM,
} from "./price-research-modal"

// Caracterização das derivações que saíram do PriceResearchModal: o texto esperado é o que a tela
// mostrava antes da extração, byte a byte.

function dated(dataResultado: string | null, dataCompra: string | null): ComprasMaterialPriceResult {
	return { dataResultado, dataCompra } as ComprasMaterialPriceResult
}

function finding(code: string, justification: ResearchFinding["justification"]): ResearchFinding {
	return { code, message: code, basis: "base", remedy: "remédio", justification, justified: false } as ResearchFinding
}

describe("formatadores", () => {
	test("BRL e NUM em pt-BR", () => {
		expect(BRL.format(1234.5)).toBe(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(1234.5))
		expect(NUM.format(3)).toBe("3,00")
		expect(NUM.format(1234.567)).toBe("1.234,57")
	})
})

describe("formatDate", () => {
	test("vazio, null e undefined viram travessão", () => {
		expect(formatDate(null)).toBe("—")
		expect(formatDate(undefined)).toBe("—")
		expect(formatDate("")).toBe("—")
	})
	test("data ISO vira dd/mm/aaaa, ignorando a hora", () => {
		expect(formatDate("2026-03-07")).toBe("07/03/2026")
		expect(formatDate("2026-03-07T12:34:56Z")).toBe("07/03/2026")
	})
	test("fora do formato ISO devolve os 10 primeiros caracteres", () => {
		expect(formatDate("07/03/2026 10:00")).toBe("07/03/2026")
		expect(formatDate("abc")).toBe("abc")
	})
})

describe("getRecommendation", () => {
	test("CV abaixo de 15 é homogêneo", () => {
		expect(getRecommendation(14.9)).toEqual({ text: "Distribuição homogênea — média e mediana equivalentes.", colorClass: "text-success" })
	})
	test("CV de 15 a menos de 30 é moderado", () => {
		expect(getRecommendation(15)).toEqual({ text: "Variabilidade moderada — prefira a mediana.", colorClass: "text-warning" })
		expect(getRecommendation(29.9).colorClass).toBe("text-warning")
	})
	test("CV de 30 em diante é alta variabilidade", () => {
		expect(getRecommendation(30)).toEqual({
			text: "Alta variabilidade — mediana recomendada (IN SEGES/ME 65/2021, art. 6º).",
			colorClass: "text-destructive",
		})
	})
})

describe("hasReferenceDate", () => {
	test("data do resultado ou, na falta, da compra", () => {
		expect(hasReferenceDate(dated("2026-01-01", null))).toBe(true)
		expect(hasReferenceDate(dated(null, "2026-01-01"))).toBe(true)
		expect(hasReferenceDate(dated(null, null))).toBe(false)
	})
	test("`??` só cai na data da compra com null: string vazia no resultado não tem data", () => {
		expect(hasReferenceDate(dated("", "2026-01-01"))).toBe(false)
	})
})

describe("groupFindings", () => {
	test("agrupa pela justificativa, na ordem da primeira ocorrência", () => {
		const a = finding("a", "lowSample")
		const b = finding("b", "method")
		const c = finding("c", "lowSample")
		expect(groupFindings([a, b, c])).toEqual([
			{ key: "lowSample", findings: [a, c] },
			{ key: "method", findings: [b] },
		])
	})
	test("sem justificativa, cada não conformidade fica no próprio grupo", () => {
		const a = finding("a", null)
		const b = finding("b", null)
		expect(groupFindings([a, b])).toEqual([
			{ key: null, findings: [a] },
			{ key: null, findings: [b] },
		])
	})
	test("lista vazia", () => {
		expect(groupFindings([])).toEqual([])
	})
})

describe("hasLoadedResults", () => {
	test("só depois de carregar e com ao menos um registro", () => {
		expect(hasLoadedResults(false, 1)).toBe(true)
		expect(hasLoadedResults(true, 1)).toBe(false)
		expect(hasLoadedResults(false, 0)).toBe(false)
	})
})

describe("formatPeriodLabel", () => {
	test("com janela e amostras fora dela", () => {
		expect(formatPeriodLabel(12, 3)).toBe("Últimos 12 meses (3 fora)")
	})
	test("com janela e nada fora", () => {
		expect(formatPeriodLabel(12, 0)).toBe("Últimos 12 meses")
	})
	test("sem janela (null ou 0) é todo o histórico", () => {
		expect(formatPeriodLabel(null, 5)).toBe("Todo o histórico")
		expect(formatPeriodLabel(0, 5)).toBe("Todo o histórico")
	})
})

describe("formatUndatedLabel", () => {
	test("incluídas e fora do cálculo", () => {
		expect(formatUndatedLabel(true, 2)).toBe("2 sem data no cálculo")
		expect(formatUndatedLabel(false, 2)).toBe("2 sem data: fora do cálculo")
	})
})

describe("formatSampleScopeLabel", () => {
	test("seleção manual vence a janela", () => {
		expect(formatSampleScopeLabel(true, 12)).toBe("Seleção manual")
	})
	test("janela de recência", () => {
		expect(formatSampleScopeLabel(false, 12)).toBe("Resultados dos últimos 12 meses")
	})
	test("sem janela", () => {
		expect(formatSampleScopeLabel(false, null)).toBe("Todo o histórico")
		expect(formatSampleScopeLabel(false, 0)).toBe("Todo o histórico")
	})
})

describe("getIncomparableSuffix", () => {
	test("singular só com exatamente 1", () => {
		expect(getIncomparableSuffix(1)).toBe("l")
		expect(getIncomparableSuffix(2)).toBe("is")
		expect(getIncomparableSuffix(0)).toBe("is")
	})
})

describe("getUsePriceLabel", () => {
	test("o método sendo gravado mostra Salvando…; os outros, Usar", () => {
		expect(getUsePriceLabel("mean", "mean")).toBe("Salvando…")
		expect(getUsePriceLabel("median", "mean")).toBe("Usar")
		expect(getUsePriceLabel(null, "lowest")).toBe("Usar")
	})
})

describe("getMeanPriceTitle", () => {
	test("sem dica quando a média é permitida", () => {
		expect(getMeanPriceTitle(true)).toBeUndefined()
	})
	test("com a base legal quando a média passa da mediana", () => {
		expect(getMeanPriceTitle(false)).toBe("A média passa da mediana: o preço estimado não pode superá-la (IN SEGES/ME 65/2021, art. 6º, § 6º).")
	})
})

describe("formatResultsCount", () => {
	test("sem filtro mostra só o total", () => {
		expect(formatResultsCount(1500, 1500)).toBe("1.500 resultados")
	})
	test("com filtro mostra filtrados de total", () => {
		expect(formatResultsCount(12, 1500)).toBe("12 de 1.500 resultados")
	})
})

describe("computeVirtualPadding", () => {
	test("sem linhas virtuais, nenhum espaçador", () => {
		expect(computeVirtualPadding([], 1000)).toEqual({ paddingTop: 0, paddingBottom: 0 })
	})
	test("espaçador acima até a primeira e abaixo da última", () => {
		expect(
			computeVirtualPadding(
				[
					{ start: 88, end: 132 },
					{ start: 132, end: 176 },
				],
				440
			)
		).toEqual({ paddingTop: 88, paddingBottom: 264 })
	})
})

describe("formatMunicipalityLabel", () => {
	test("com e sem UF", () => {
		expect(formatMunicipalityLabel("Rio de Janeiro", "RJ")).toBe("Rio de Janeiro — RJ")
		expect(formatMunicipalityLabel("Rio de Janeiro", null)).toBe("Rio de Janeiro")
		expect(formatMunicipalityLabel("Rio de Janeiro", "")).toBe("Rio de Janeiro")
	})
})

describe("formatCapacityLabel", () => {
	test("com nome da unidade", () => {
		expect(formatCapacityLabel(5, "QUILOGRAMA")).toBe("5,00 QUILOGRAMA")
	})
	test("sem nome mantém o espaço final", () => {
		expect(formatCapacityLabel(5, null)).toBe("5,00 ")
	})
	test("`??` preserva string vazia", () => {
		expect(formatCapacityLabel(0, "")).toBe("0,00 ")
	})
})

describe("createPriceRowIdResolver", () => {
	const row = (idCompra: string, idItemCompra: number, dataResultado: string | null) =>
		({ idCompra, idItemCompra, dataResultado, dataCompra: null }) as ComprasMaterialPriceResult

	test("id do registro, sem índice: recortar a lista (janela de recência) não muda o id de quem fica", () => {
		const old = row("C1", 1, "2020-01-01")
		const recent = row("C2", 3, "2026-09-01")
		const all = [old, recent]
		const idOf = createPriceRowIdResolver(all)
		expect(idOf(recent)).toBe("C2-3")
		// Antes o id era `compra-item-índice` sobre a lista recortada: "C2-3-1" com a janela
		// aberta e "C2-3-0" com ela fechada, e a seleção apontava para outra linha.
		const scoped = all.filter((r) => r.dataResultado?.startsWith("2026"))
		expect(scoped.map(idOf)).toEqual(["C2-3"])
	})

	test("o mesmo item de compra repetido ganha sufixo pela ordem de chegada, sem colidir", () => {
		const a = row("C1", 1, null)
		const b = row("C1", 1, null)
		const c = row("C1", 2, null)
		const idOf = createPriceRowIdResolver([a, b, c])
		expect([idOf(a), idOf(b), idOf(c)]).toEqual(["C1-1", "C1-1#2", "C1-2"])
	})

	test("registro fora da lista ganha o próximo sufixo, nunca o id de outra linha", () => {
		const a = row("C1", 1, null)
		const idOf = createPriceRowIdResolver([a])
		const stray = row("C1", 1, null)
		expect(idOf(stray)).toBe("C1-1#2")
		// e o mesmo registro mantém o id que recebeu
		expect(idOf(stray)).toBe("C1-1#2")
		expect(idOf(a)).toBe("C1-1")
	})
})
