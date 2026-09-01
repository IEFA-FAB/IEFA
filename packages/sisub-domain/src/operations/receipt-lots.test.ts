import { describe, expect, test } from "bun:test"
import {
	checkLotTemperatures,
	hasTemperatureDivergence,
	lotBalance,
	nextSyntheticSequence,
	type ReceiptLotDraft,
	roundQuantity,
	sumLotQuantities,
	syntheticLotCode,
	validateReceiptLots,
} from "./receipt-lots.ts"

function lot(over: Partial<ReceiptLotDraft> = {}): ReceiptLotDraft {
	return { lotCode: "L1", expiryDate: "2027-01-31", quantityBase: 10, ...over }
}

describe("sumLotQuantities", () => {
	test("soma na escala de numeric(14,4) — float cru acusaria diferença onde o banco vê igualdade", () => {
		expect(sumLotQuantities([lot({ quantityBase: 0.1 }), lot({ quantityBase: 0.2 })])).toBe(0.3)
	})

	test("lista vazia soma zero", () => {
		expect(sumLotQuantities([])).toBe(0)
	})

	test("quantidade não finita não contamina a soma", () => {
		expect(sumLotQuantities([lot({ quantityBase: 10 }), lot({ quantityBase: Number.NaN })])).toBe(10)
	})
})

describe("lotBalance", () => {
	test("fecha quando a soma bate com o conferido", () => {
		expect(lotBalance(30, [lot({ quantityBase: 10 }), lot({ lotCode: "L2", quantityBase: 20 })])).toEqual({ total: 30, remaining: 0, status: "fecha" })
	})

	test("fecha mesmo com resíduo de ponto flutuante abaixo da escala do banco", () => {
		const lots = [lot({ quantityBase: 0.1 }), lot({ lotCode: "L2", quantityBase: 0.2 })]
		expect(lotBalance(0.3, lots).status).toBe("fecha")
	})

	test("parcial durante a digitação é 'falta', não erro", () => {
		// A conferência lança um lote por vez; a invariante só vale na efetivação.
		expect(lotBalance(30, [lot({ quantityBase: 10 })])).toEqual({ total: 10, remaining: 20, status: "falta" })
	})

	test("excedente é distinguível de falta", () => {
		const balance = lotBalance(10, [lot({ quantityBase: 25 })])
		expect(balance.status).toBe("excede")
		expect(balance.remaining).toBe(-15)
	})

	test("sem lote nenhum é 'vazio' — estado inicial legítimo", () => {
		expect(lotBalance(30, [])).toEqual({ total: 0, remaining: 30, status: "vazio" })
	})
})

describe("código sintético", () => {
	test("formato estável com sufixo de sequência", () => {
		expect(syntheticLotCode("2026-09-01", 1)).toBe("SEM-LOTE-2026-09-01-1")
	})

	test("a próxima sequência pula os sintéticos já usados", () => {
		// Duas caixas sem código na mesma entrega colidiriam no unique
		// (receipt_item_id, lot_code) — é o caso "metade veio com lote, metade não".
		expect(nextSyntheticSequence(["SEM-LOTE-2026-09-01-1", "SEM-LOTE-2026-09-01-2"])).toBe(3)
	})

	test("código de fornecedor não é confundido com sintético", () => {
		expect(nextSyntheticSequence(["LOTE-2026-09-01-7", "AB1234"])).toBe(1)
	})

	test("sequência ignora data diferente mas respeita o maior número visto", () => {
		expect(nextSyntheticSequence(["SEM-LOTE-2026-08-30-4"])).toBe(5)
	})

	test("lista vazia começa em 1", () => {
		expect(nextSyntheticSequence([])).toBe(1)
	})
})

describe("validateReceiptLots", () => {
	test("entrega coerente não gera achado", () => {
		expect(validateReceiptLots(30, [lot({ quantityBase: 10 }), lot({ lotCode: "L2", quantityBase: 20 })])).toEqual([])
	})

	test("sem lote nenhum não é erro — a efetivação gera o sintético", () => {
		expect(validateReceiptLots(30, [])).toEqual([])
	})

	test("acusa TODOS os problemas de uma vez, não o primeiro", () => {
		const issues = validateReceiptLots(30, [lot({ lotCode: "  ", quantityBase: 0 }), lot({ lotCode: "L2", quantityBase: -1 })])
		expect(issues.map((i) => i.code).sort()).toEqual(["codigo_vazio", "quantidade_invalida", "quantidade_invalida", "soma_diverge"])
	})

	test("código duplicado é acusado sem distinguir caixa", () => {
		const issues = validateReceiptLots(20, [lot({ lotCode: "ab1", quantityBase: 10 }), lot({ lotCode: "AB1", quantityBase: 10 })])
		expect(issues.map((i) => i.code)).toEqual(["codigo_duplicado"])
	})

	test("soma divergente é acusada com os dois números", () => {
		const issues = validateReceiptLots(30, [lot({ quantityBase: 25 })])
		expect(issues).toHaveLength(1)
		expect(issues[0].code).toBe("soma_diverge")
		expect(issues[0].message).toContain("25")
		expect(issues[0].message).toContain("30")
	})

	test("validade fora do formato ISO é acusada", () => {
		const issues = validateReceiptLots(10, [lot({ expiryDate: "31/12/2026" })])
		expect(issues.map((i) => i.code)).toEqual(["validade_invalida"])
	})

	test("validade nula é legítima — fornecedor pode não informar", () => {
		expect(validateReceiptLots(10, [lot({ expiryDate: null })])).toEqual([])
	})
})

describe("checkLotTemperatures", () => {
	const congelado = { minC: null, maxC: -12 }

	test("cada lote tem seu veredito — a mesma entrega pode ter caixas em condições diferentes", () => {
		const checks = checkLotTemperatures(
			[lot({ lotCode: "A", measuredTemperatureC: -18 }), lot({ lotCode: "B", measuredTemperatureC: -4 }), lot({ lotCode: "C" })],
			congelado
		)
		expect(checks).toEqual([
			{ lotCode: "A", verdict: "dentro", outOfRange: false },
			{ lotCode: "B", verdict: "acima", outOfRange: true },
			{ lotCode: "C", verdict: "nao_medido", outOfRange: false },
		])
	})

	test("um lote fora já marca a entrega como divergente", () => {
		const checks = checkLotTemperatures([lot({ lotCode: "A", measuredTemperatureC: -18 }), lot({ lotCode: "B", measuredTemperatureC: -4 })], congelado)
		expect(hasTemperatureDivergence(checks)).toBe(true)
	})

	test("entrega sem medição alguma não é divergente — não medir não é reprovar", () => {
		expect(hasTemperatureDivergence(checkLotTemperatures([lot({ lotCode: "A" })], congelado))).toBe(false)
	})
})

describe("roundQuantity", () => {
	test("arredonda para a escala do banco", () => {
		expect(roundQuantity(1.00004)).toBe(1)
		expect(roundQuantity(1.00006)).toBe(1.0001)
	})
})
