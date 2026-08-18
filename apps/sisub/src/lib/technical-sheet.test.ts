/**
 * Matemática da Ficha Técnica de Preparação (`technical-sheet.ts`).
 *
 * O que a suíte protege é o que nenhum tipo pega: o banco guarda o peso líquido TOTAL da
 * preparação, o formulário oficial é lido POR CAPITA, e a divisão pelo rendimento estava
 * espalhada por cada tela. A tabela do editor e a folha de impressão têm que imprimir o
 * mesmo número — e um FC zerado não pode zerar a ficha inteira em silêncio.
 */

import { describe, expect, test } from "vitest"
import { formatSheetNumber, portionYieldOrOne, technicalSheetLine, technicalSheetTotals } from "./technical-sheet"

const line = (netQuantity: number | null, correctionFactor: number | null = null, rehydrationIndex: number | null = null) =>
	technicalSheetLine({ netQuantity, correctionFactor, rehydrationIndex }, 100)

describe("technicalSheetLine", () => {
	test("divide o peso líquido total pelo rendimento", () => {
		expect(line(50).netWeight).toBeCloseTo(0.5, 10)
	})

	test("PB = PL x FC", () => {
		const result = line(50, 1.33)
		expect(result.grossWeight).toBeCloseTo(0.665, 10)
		expect(result.correctionFactor).toBe(1.33)
	})

	test("peso reidratado = PL x IR", () => {
		const result = line(10, null, 2.5)
		expect(result.rehydratedWeight).toBeCloseTo(0.25, 10)
	})

	test("fator ausente vale 1 — campo vazio é 'sem correção', não zero", () => {
		const result = line(50)
		expect(result.correctionFactor).toBe(1)
		expect(result.rehydrationIndex).toBe(1)
		expect(result.grossWeight).toBeCloseTo(result.netWeight, 10)
		expect(result.rehydratedWeight).toBeCloseTo(result.netWeight, 10)
	})

	test("fator não-positivo é ignorado — FC zerado zeraria a ficha inteira", () => {
		expect(line(50, 0).grossWeight).toBeCloseTo(0.5, 10)
		expect(line(50, -2).correctionFactor).toBe(1)
	})

	test("quantidade nula vira zero, não NaN", () => {
		const result = line(null)
		expect(result.netWeight).toBe(0)
		expect(result.grossWeight).toBe(0)
	})

	test("rendimento zero ou nulo não produz Infinity", () => {
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: null, rehydrationIndex: null }, 0).netWeight).toBe(50)
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: null, rehydrationIndex: null }, null).netWeight).toBe(50)
		expect(portionYieldOrOne(0)).toBe(1)
		expect(portionYieldOrOne(120)).toBe(120)
	})
})

describe("technicalSheetTotals", () => {
	test("soma as três colunas de peso", () => {
		const totals = technicalSheetTotals([line(50, 1.2), line(30)])
		expect(totals.netWeight).toBeCloseTo(0.8, 10)
		expect(totals.grossWeight).toBeCloseTo(0.9, 10)
	})

	test("coleta as unidades distintas — o TOTAL do papel pressupõe uma só", () => {
		const totals = technicalSheetTotals([
			{ ...line(50), measureUnit: "KG" },
			{ ...line(30), measureUnit: "KG" },
			{ ...line(10), measureUnit: "UN" },
		])
		expect(totals.units).toEqual(["KG", "UN"])
	})

	test("unidade em branco não vira grupo próprio", () => {
		const totals = technicalSheetTotals([
			{ ...line(50), measureUnit: "KG" },
			{ ...line(30), measureUnit: "  " },
			{ ...line(10), measureUnit: null },
		])
		expect(totals.units).toEqual(["KG"])
	})

	test("ficha vazia soma zero", () => {
		expect(technicalSheetTotals([])).toEqual({ grossWeight: 0, netWeight: 0, rehydratedWeight: 0, units: [] })
	})
})

describe("formatSheetNumber", () => {
	test("três casas por padrão — tempero em preparação de 100 porções cai na terceira", () => {
		expect(formatSheetNumber(0.0025)).toBe("0,003")
		expect(formatSheetNumber(0.5)).toBe("0,5")
	})

	test("valor não finito não imprime NaN", () => {
		expect(formatSheetNumber(Number.NaN)).toBe("—")
		expect(formatSheetNumber(Number.POSITIVE_INFINITY)).toBe("—")
	})
})
