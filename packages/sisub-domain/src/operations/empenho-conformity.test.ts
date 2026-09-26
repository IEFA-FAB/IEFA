import { describe, expect, test } from "bun:test"
import {
	type ArpItemFacts,
	checkEmpenhoAgainstArp,
	empenhoItemProblems,
	isEmpenhoWithoutOrigin,
	resolveItemValue,
	sumEmpenhoItems,
} from "./empenho-conformity.ts"

const arpItem = (id: string, patch: Partial<ArpItemFacts> = {}): ArpItemFacts => ({
	id,
	numeroItem: 1,
	description: "ARROZ",
	unitPrice: 5,
	officialBalance: 1000,
	localCommitted: 0,
	validFrom: "2026-01-01",
	validTo: "2026-12-31",
	...patch,
})

describe("itens da NE", () => {
	test("uma NE para três itens da ata soma os três", () => {
		const items = [
			{ arpItemId: "a", quantity: 50, unitPrice: 5, value: 250 },
			{ arpItemId: "b", quantity: 50, unitPrice: 8, value: 400 },
			{ arpItemId: "c", quantity: 50, unitPrice: 10, value: 500 },
		]
		expect(empenhoItemProblems(items)).toEqual([])
		expect(sumEmpenhoItems(items)).toBe(1150)
	})

	test("NE estimativa ou global aceita item só com valor", () => {
		expect(empenhoItemProblems([{ value: 30_000 }])).toEqual([])
	})

	test("valor vazio vem de quantidade × preço", () => {
		expect(resolveItemValue({ quantity: 3, unitPrice: 2.5, value: 0 })).toBe(7.5)
	})

	test("dado incoerente é recusado com o item", () => {
		expect(empenhoItemProblems([])).toHaveLength(1)
		expect(empenhoItemProblems([{ value: 0 }])[0]?.message).toContain("Item 1")
		expect(empenhoItemProblems([{ quantity: 10, unitPrice: 5, value: 60 }])[0]?.message).toContain("não fecha")
	})
})

describe("conferência NE × ARP", () => {
	const arpItems = new Map([
		["a", arpItem("a")],
		["b", arpItem("b", { numeroItem: 2, description: "FEIJAO", unitPrice: 8, officialBalance: 40 })],
	])

	test("preço diferente, saldo excedido e vigência são avisos, não recusa", () => {
		const warnings = checkEmpenhoAgainstArp({
			empenhoDate: "2027-01-10",
			items: [
				{ arpItemId: "a", quantity: 10, unitPrice: 5.5 },
				{ arpItemId: "b", quantity: 50, unitPrice: 8 },
			],
			arpItems,
		})
		expect(warnings.map((w) => `${w.arpItemId}:${w.code}`).sort()).toEqual(["a:outside_validity", "a:price_differs", "b:above_balance", "b:outside_validity"])
	})

	test("NE conforme não gera aviso", () => {
		expect(checkEmpenhoAgainstArp({ empenhoDate: "2026-05-01", items: [{ arpItemId: "a", quantity: 10, unitPrice: 5 }], arpItems })).toEqual([])
	})

	test("dois itens do mesmo item da ata somam para o saldo", () => {
		const warnings = checkEmpenhoAgainstArp({
			empenhoDate: "2026-05-01",
			items: [
				{ arpItemId: "b", quantity: 30, unitPrice: 8 },
				{ arpItemId: "b", quantity: 20, unitPrice: 8 },
			],
			arpItems,
		})
		expect(warnings.map((w) => w.code)).toEqual(["above_balance"])
	})

	test("ARP à mão não sincronizada avisa que o saldo não foi conferido", () => {
		const warnings = checkEmpenhoAgainstArp({ empenhoDate: "2026-05-01", items: [{ arpItemId: "a", quantity: 1, unitPrice: 5 }], arpItems, arpSynced: false })
		expect(warnings.map((w) => w.code)).toEqual(["arp_not_synced"])
	})
})

describe("NE sem contratação de origem (derivado)", () => {
	test("sem contratação e sem item de ARP é pendência; qualquer um dos dois vincula", () => {
		expect(isEmpenhoWithoutOrigin({ acquisitionId: null, itemArpItemIds: [null] })).toBe(true)
		expect(isEmpenhoWithoutOrigin({ acquisitionId: "x", itemArpItemIds: [null] })).toBe(false)
		expect(isEmpenhoWithoutOrigin({ acquisitionId: null, itemArpItemIds: [null, "a"] })).toBe(false)
	})
})
