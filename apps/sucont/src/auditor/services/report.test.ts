/**
 * Contrato do recorte que alimenta a Nota Analítica Estratégica.
 *
 * Os números da nota saem daqui, então cada bloco trava uma leitura que a versão
 * de origem errava: o total dos módulos apresentado como líquido, a lista de
 * "melhorias" com unidades que pioraram, e o percentual inventado sobre uma
 * divergência anterior que era zero.
 */

import { describe, expect, it } from "bun:test"
import { AccountGroup, type RawInputRow } from "../types"
import { normalizeData } from "./dataProcessor"
import { buildReportDataset, TOP_OFFENDERS } from "./report"

type Pair = [siafi: number, siloms: number]

function raw(data: string, cod: string, ug: string, groups: { consumo?: Pair; bmp?: Pair; intangivel?: Pair }): RawInputRow {
	const [c1, c2] = groups.consumo ?? [0, 0]
	const [b1, b2] = groups.bmp ?? [0, 0]
	const [i1, i2] = groups.intangivel ?? [0, 0]
	return {
		data,
		cod,
		ug,
		g1_name: AccountGroup.CONSUMO,
		g1_siafi: c1,
		g1_siloms: c2,
		// `0` de propósito: `normalizeData` então recalcula |SIAFI − SILOMS|, que é o
		// que o app faz com o arquivo real — a coluna DIF de origem nunca é fonte.
		g1_diff: 0,
		g2_name: AccountGroup.BMP,
		g2_siafi: b1,
		g2_siloms: b2,
		g2_diff: 0,
		g3_name: AccountGroup.INTANGIVEL,
		g3_siafi: i1,
		g3_siloms: i2,
		g3_diff: 0,
	}
}

/**
 * Duas competências consecutivas com as quatro situações que interessam:
 * divergência que cresce, divergência que cai, divergência que nasce sobre base
 * zero e unidade que só existe na competência corrente.
 */
const ROWS: RawInputRow[] = [
	raw("2025-06", "120100", "GAP-RJ", { consumo: [1000, 1000], bmp: [5000, 4000] }),
	raw("2025-06", "120200", "GAP-SP", { bmp: [10_000, 8000] }),
	// SILOMS maior que SIAFI aqui: é o que faz o total líquido diferir do total dos módulos.
	raw("2025-07", "120100", "GAP-RJ", { consumo: [900, 1000], bmp: [5000, 4500] }),
	raw("2025-07", "120200", "GAP-SP", { bmp: [10_000, 7000] }),
	raw("2025-07", "120300", "BAAN", { bmp: [2000, 1500] }),
]

const dataset = buildReportDataset({
	data: normalizeData(ROWS),
	competence: "2025-07",
	timeFilter: "MENSAL",
	scopeLabel: "todas as UGs",
})

const mensal = dataset.trends.find((t) => t.scope === "MENSAL")

describe("buildReportDataset — totais", () => {
	it("separa a soma dos módulos da diferença líquida", () => {
		expect(dataset.totals.siafi).toBe(17_900)
		expect(dataset.totals.siloms).toBe(14_000)
		// 100 + 500 + 3000 + 500: o que existe para conciliar.
		expect(dataset.totals.absoluteDifference).toBe(4100)
		// 17.900 − 14.000: a sobra da GAP-RJ em Consumo compensa parte da falta.
		expect(dataset.totals.netDifference).toBe(3900)
		// Se as duas fossem iguais o teste não provaria nada — é a distância entre
		// elas que a nota apresenta como diagnóstico.
		expect(dataset.totals.netDifference).not.toBe(dataset.totals.absoluteDifference)
	})

	it("conta unidades e registros separadamente", () => {
		expect(dataset.ugCount).toBe(3)
		// Registro é o par (UG, grupo de contas) COM saldo — o número que a origem
		// confundia com unidades. `normalizeData` emitiria nove: três UGs × três
		// naturezas, cinco delas sem saldo em nenhum dos dois sistemas.
		expect(dataset.recordCount).toBe(4)
		expect(dataset.periodsLoaded).toBe(2)
	})

	it("classifica a preponderância registro a registro", () => {
		expect(dataset.preponderance).toEqual({ siafi: 3, siloms: 1, equal: 0 })
	})

	// Zero nos dois sistemas é ausência de saldo, não conciliação. Contá-lo como
	// "equilibrado" afirmaria, num documento assinado, que cinco contas estão
	// conciliadas quando nenhuma delas foi sequer reportada.
	it("não trata natureza sem saldo algum como conta conciliada", () => {
		const semSaldo = normalizeData([raw("2025-07", "120400", "BAFZ", {})])
		const vazio = buildReportDataset({ data: semSaldo, competence: "2025-07", timeFilter: "MENSAL", scopeLabel: "todas as UGs" })

		expect(vazio.recordCount).toBe(0)
		expect(vazio.ugCount).toBe(0)
		expect(vazio.preponderance).toEqual({ siafi: 0, siloms: 0, equal: 0 })
		expect(vazio.topOffenders).toEqual([])
		expect(vazio.groups).toEqual([])
	})

	it("mantém a conta conciliada de verdade — saldo igual e não-nulo nos dois", () => {
		const conciliada = normalizeData([raw("2025-07", "120400", "BAFZ", { bmp: [3000, 3000] })])
		const iguais = buildReportDataset({ data: conciliada, competence: "2025-07", timeFilter: "MENSAL", scopeLabel: "todas as UGs" })

		expect(iguais.recordCount).toBe(1)
		expect(iguais.preponderance).toEqual({ siafi: 0, siloms: 0, equal: 1 })
	})

	it("traz a competência anterior quando ela está na base", () => {
		expect(dataset.previous?.period).toBe("2025-06")
		expect(dataset.previous?.totals.absoluteDifference).toBe(3000)
	})

	it("devolve `null` — e não uma linha de zeros — quando a anterior não está na base", () => {
		const primeira = buildReportDataset({ data: normalizeData(ROWS), competence: "2025-06", timeFilter: "MENSAL", scopeLabel: "todas as UGs" })
		expect(primeira.previous).toBeNull()
	})
})

describe("buildReportDataset — maiores divergências", () => {
	it("ordena por divergência decrescente", () => {
		expect(dataset.topOffenders.slice(0, 2).map((o) => [o.ug, o.difference])).toEqual([
			["GAP-SP", 3000],
			["GAP-RJ", 500],
		])
	})

	it("não enche a tabela com registros sem saldo em nenhum dos sistemas", () => {
		for (const offender of dataset.topOffenders) expect(offender.siafi !== 0 || offender.siloms !== 0).toBe(true)
		expect(dataset.topOffenders).toHaveLength(4)
	})

	it("corta no teto declarado", () => {
		const muitas = Array.from({ length: TOP_OFFENDERS + 10 }, (_, i) => raw("2025-07", `1210${String(i).padStart(2, "0")}`, `UG-${i}`, { bmp: [1000 + i, 0] }))
		const big = buildReportDataset({ data: normalizeData(muitas), competence: "2025-07", timeFilter: "MENSAL", scopeLabel: "todas as UGs" })
		expect(big.topOffenders).toHaveLength(TOP_OFFENDERS)
	})
})

describe("buildReportDataset — tendências", () => {
	it("só lista como agravamento quem aumentou", () => {
		expect(mensal?.worsening.map((i) => [i.ug, i.group, i.delta])).toEqual([
			["GAP-SP", AccountGroup.BMP, 1000],
			["GAP-RJ", AccountGroup.CONSUMO, 100],
		])
	})

	// Defeito da origem: `improving` saía de um `sort` sobre a mesma lista, sem
	// filtrar o sinal. Com menos de cinco reduções, entravam UGs que pioraram.
	it("só lista como melhoria quem reduziu", () => {
		expect(mensal?.improving.map((i) => [i.ug, i.group, i.delta])).toEqual([["GAP-RJ", AccountGroup.BMP, -500]])
		for (const item of mensal?.improving ?? []) expect(item.delta).toBeLessThan(0)
	})

	// Defeito da origem: o percentual caía em `100` quando não havia base.
	it("devolve percentual nulo quando a divergência anterior era zero", () => {
		const nascida = mensal?.worsening.find((i) => i.ug === "GAP-RJ" && i.group === AccountGroup.CONSUMO)
		expect(nascida?.previousDifference).toBe(0)
		expect(nascida?.deltaPct).toBeNull()

		const cresceu = mensal?.worsening.find((i) => i.ug === "GAP-SP")
		expect(cresceu?.deltaPct).toBe(50)
	})

	it("ignora a unidade que não tem competência anterior na base", () => {
		const todas = [...(mensal?.worsening ?? []), ...(mensal?.improving ?? [])]
		expect(todas.some((i) => i.ug === "BAAN")).toBe(false)
	})

	it("apresenta sempre os três escopos, mesmo sem histórico para eles", () => {
		expect(dataset.trends.map((t) => t.scope)).toEqual(["MENSAL", "TRIMESTRAL", "SEMESTRAL"])
		const semestral = dataset.trends.find((t) => t.scope === "SEMESTRAL")
		expect(semestral?.worsening).toEqual([])
		expect(semestral?.improving).toEqual([])
	})
})

describe("buildReportDataset — grupos e hipóteses", () => {
	// Ordem fixa, e sem a natureza que não tem saldo nenhum: a origem imprimia uma
	// linha "Bens Intangíveis · R$ 0,00 · 3 UGs" para contas que ninguém reportou.
	it("mantém a ordem fixa dos grupos e omite a natureza sem saldo", () => {
		expect(dataset.groups.map((g) => g.group)).toEqual([AccountGroup.BMP, AccountGroup.CONSUMO])
	})

	it("soma a divergência por grupo", () => {
		const bmp = dataset.groups.find((g) => g.group === AccountGroup.BMP)
		expect(bmp?.difference).toBe(4000)
		expect(bmp?.ugCount).toBe(3)
	})

	it("não levanta hipótese de transferência sob o piso de materialidade", () => {
		expect(dataset.interOm).toEqual([])
	})
})
