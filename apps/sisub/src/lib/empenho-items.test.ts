import { describe, expect, it } from "vitest"
import { committedQuantity, summarizeArpItemShare } from "@/lib/empenho-items"

describe("committedQuantity", () => {
	it("item único: a quantidade dele", () => {
		expect(committedQuantity([{ quantity: "100", unit: "KG" }])).toBe(100)
	})

	it("vários itens na mesma unidade somam", () => {
		expect(
			committedQuantity([
				{ quantity: 60, unit: "KG" },
				{ quantity: 40, unit: "kg " },
			])
		).toBe(100)
	})

	it("unidades diferentes não somam: quilo com litro vira —", () => {
		expect(
			committedQuantity([
				{ quantity: 100, unit: "KG" },
				{ quantity: 50, unit: "L" },
			])
		).toBeNull()
	})

	it("item só por valor torna a quantidade desconhecida", () => {
		expect(
			committedQuantity([
				{ quantity: 100, unit: "KG" },
				{ quantity: null, unit: null },
			])
		).toBeNull()
	})

	it("vários itens sem unidade: não dá para saber se são a mesma", () => {
		expect(
			committedQuantity([
				{ quantity: 1, unit: null },
				{ quantity: 2, unit: null },
			])
		).toBeNull()
	})

	it("NE sem itens: —", () => {
		expect(committedQuantity([])).toBeNull()
	})
})

describe("summarizeArpItemShare", () => {
	it("mesmo preço: quantidade × preço fecha com o valor", () => {
		expect(
			summarizeArpItemShare(
				[
					{ quantity: 3, unit_price: 10, value: 30 },
					{ quantity: 4, unit_price: "10", value: "40" },
				],
				999
			)
		).toEqual({ item_quantity: 7, item_unit_price: 10, item_value: 70 })
	})

	it("preços diferentes: sem preço comum (a tela mostra o médio)", () => {
		expect(
			summarizeArpItemShare(
				[
					{ quantity: 3, unit_price: 10, value: 30 },
					{ quantity: 4, unit_price: 12, value: 48 },
				],
				999
			)
		).toEqual({ item_quantity: 7, item_unit_price: null, item_value: 78 })
	})

	it("item só por valor misturado: sem quantidade nem preço", () => {
		expect(
			summarizeArpItemShare(
				[
					{ quantity: 3, unit_price: 10, value: 30 },
					{ quantity: null, unit_price: null, value: 20 },
				],
				999
			)
		).toEqual({ item_quantity: null, item_unit_price: null, item_value: 50 })
	})

	it("sem itens: o valor de reserva", () => {
		expect(summarizeArpItemShare([], 500)).toEqual({ item_quantity: null, item_unit_price: null, item_value: 500 })
	})
})
