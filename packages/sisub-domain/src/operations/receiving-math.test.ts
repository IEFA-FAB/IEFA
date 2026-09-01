import { describe, expect, test } from "bun:test"
import { divergesFromInvoice, requiresDivergenceReason, unitCostFromNfe } from "./receiving-math.ts"

describe("unitCostFromNfe", () => {
	test("converte o preço da EMBALAGEM para custo da unidade base", () => {
		// A nota preça o fardo (R$ 125); o ledger valora o quilo. Um fardo de 5 kg
		// a R$ 125 é R$ 25/kg — sem a divisão, o custo médio entra 5× maior, e o
		// ledger é append-only: o conserto é movimento de ajuste, não UPDATE.
		expect(unitCostFromNfe({ invoicedQtyBase: 50, unitPrice: 125, commercialQty: 10 })).toBe(25)
	})

	test("arredonda na escala do numeric(12,4)", () => {
		expect(unitCostFromNfe({ invoicedQtyBase: 3, unitPrice: 10, commercialQty: 1 })).toBe(3.3333)
	})

	test("sem preço ou sem quantidade comercial devolve null, não zero", () => {
		// Zero seria um custo AFIRMADO: entraria no custo médio e o diluiria.
		expect(unitCostFromNfe({ invoicedQtyBase: 50, unitPrice: null, commercialQty: 10 })).toBeNull()
		expect(unitCostFromNfe({ invoicedQtyBase: 50, unitPrice: 125, commercialQty: null })).toBeNull()
	})

	test("quantidade base ausente, zero ou negativa devolve null", () => {
		expect(unitCostFromNfe({ invoicedQtyBase: null, unitPrice: 125, commercialQty: 10 })).toBeNull()
		expect(unitCostFromNfe({ invoicedQtyBase: 0, unitPrice: 125, commercialQty: 10 })).toBeNull()
		expect(unitCostFromNfe({ invoicedQtyBase: -5, unitPrice: 125, commercialQty: 10 })).toBeNull()
	})

	test("preço zero é custo zero declarado, não ausência", () => {
		// Doação e bonificação existem: o item veio, custou nada, e isso é um fato
		// diferente de "não sei quanto custou".
		expect(unitCostFromNfe({ invoicedQtyBase: 10, unitPrice: 0, commercialQty: 1 })).toBe(0)
	})
})

describe("divergesFromInvoice", () => {
	test("quantidade diferente da faturada diverge, para mais e para menos", () => {
		expect(divergesFromInvoice(50, 48)).toBe(true)
		expect(divergesFromInvoice(50, 52)).toBe(true)
	})

	test("quantidade igual não diverge", () => {
		expect(divergesFromInvoice(50, 50)).toBe(false)
	})

	test("sem faturado não há divergência — entrega sem nota não tem referência", () => {
		expect(divergesFromInvoice(null, 48)).toBe(false)
	})
})

describe("requiresDivergenceReason", () => {
	test("divergência sem motivo é barrada (art. 140: decisão registrada)", () => {
		expect(requiresDivergenceReason(50, 48, null)).toBe(true)
		expect(requiresDivergenceReason(50, 48, "   ")).toBe(true)
		expect(requiresDivergenceReason(50, 48, undefined)).toBe(true)
	})

	test("divergência com motivo passa", () => {
		expect(requiresDivergenceReason(50, 48, "Avaria em 2 KG no transporte")).toBe(false)
	})

	test("sem divergência, motivo não é exigido", () => {
		expect(requiresDivergenceReason(50, 50, null)).toBe(false)
		expect(requiresDivergenceReason(null, 48, null)).toBe(false)
	})
})
