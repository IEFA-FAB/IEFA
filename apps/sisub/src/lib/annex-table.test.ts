import { describe, expect, test } from "vitest"
import type { AtaAnnexRow } from "@/lib/ata-annex"
import { buildAnnexTable, chunkTable, toHtmlTable, toTsv } from "./annex-table"

const row = (over: Partial<AtaAnnexRow> = {}): AtaAnnexRow => ({
	key: "k",
	ataItemId: "a",
	ingredientId: "i",
	ingredientQuantity: 1234.5,
	ingredientUnit: "KG",
	folder: "Aves",
	catmat: 447599,
	catmatDescription: "Carne de ave <in natura>",
	description: "Frango",
	itemDescription: "Peito, congelado",
	unit: "KG",
	targetQuantity: 1234.5,
	marginPercent: 20,
	maxQuantity: 1482,
	minQuoteQuantity: 371,
	effectiveMarginPercent: 20,
	deliveryCycle: "weekly",
	deliveryCycleSource: null,
	ingredientDeliveryCycle: null,
	deliveriesInValidity: null,
	cycleConsumption: null,
	suggestedMinOrderQuantity: null,
	minOrderQuantity: 12,
	minOrderSource: null,
	unitPrice: 18.9,
	warnings: [],
	choices: null,
	...over,
})

describe("buildAnnexTable", () => {
	test("colunas do TR com números no formato brasileiro e valor sobre a máxima", () => {
		const table = buildAnnexTable([row()], { confidential: false })
		expect(table.headers).toContain("Quantidade mínima a ser cotada")
		expect(table.body[0]).toEqual([
			"1",
			"447599",
			"Carne de ave <in natura>. Peito, congelado",
			"KG",
			"1.234,5",
			"1.482",
			"371",
			"12",
			"Semanal",
			"18,90",
			"28.009,80",
		])
	})

	test("orçamento sigiloso tira preço e valor", () => {
		const table = buildAnnexTable([row()], { confidential: true })
		expect(table.headers).not.toContain("Preço unitário estimado (R$)")
		expect(table.headers).not.toContain("Valor estimado (R$)")
		expect(table.body[0]).toHaveLength(9)
	})
})

describe("saída", () => {
	test("HTML escapa o texto e TSV não quebra linha dentro da célula", () => {
		const table = buildAnnexTable([row({ itemDescription: "linha 1\nlinha 2" })], { confidential: true })
		expect(toHtmlTable(table)).toContain("Carne de ave &lt;in natura&gt;")
		expect(toHtmlTable(table).startsWith('<table border="1"')).toBe(true)
		expect(toTsv(table).split("\n")).toHaveLength(2)
	})

	test("partes de 100 linhas, cada uma com cabeçalho", () => {
		const table = buildAnnexTable(
			Array.from({ length: 230 }, () => row()),
			{ confidential: false }
		)
		const parts = chunkTable(table)
		expect(parts.map((p) => p.body.length)).toEqual([100, 100, 30])
		expect(parts[2].headers).toEqual(table.headers)
		expect(parts[2].body[0][0]).toBe("201")
	})
})
