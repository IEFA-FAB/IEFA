/**
 * Matemática da Ficha Técnica de Preparação (`technical-sheet.ts`).
 *
 * O que a suíte protege é o que nenhum tipo pega: o banco guarda o peso líquido TOTAL da
 * preparação, o formulário oficial é lido POR CAPITA, e a divisão pelo rendimento estava
 * espalhada por cada tela. A tabela do editor e a folha de impressão têm que imprimir o
 * mesmo número — e um FC zerado não pode zerar a ficha inteira em silêncio.
 */

import { describe, expect, test } from "vitest"
import { formatSheetNumber, fromStoredQuantity, portionYieldOrOne, technicalSheetLine, technicalSheetTotals, toStoredQuantity } from "./technical-sheet"

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

/**
 * Base de digitação: a ficha de papel vem "por porção" ou "para o rendimento", e o banco
 * guarda sempre o total. O que a suíte protege é a IDA E VOLTA — o campo relê o que
 * gravou a cada tecla, e um resíduo de ponto flutuante ali aparece na tela como
 * 0,004999999999999999 no lugar de 0,005.
 */
describe("toStoredQuantity / fromStoredQuantity", () => {
	test("base total grava e relê o número digitado, sem tocar no rendimento", () => {
		expect(toStoredQuantity(50, "total", 100)).toBe(50)
		expect(fromStoredQuantity(50, "total", 100)).toBe(50)
	})

	test("base porção multiplica pelo rendimento na gravação", () => {
		expect(toStoredQuantity(0.5, "porcao", 100)).toBeCloseTo(50, 10)
		expect(toStoredQuantity(0.12, "porcao", 250)).toBeCloseTo(30, 10)
	})

	test("ida e volta na base porção devolve o mesmo número que foi digitado", () => {
		for (const typed of [0.005, 0.12, 1.5, 33.333, 0.001]) {
			expect(fromStoredQuantity(toStoredQuantity(typed, "porcao", 100), "porcao", 100)).toBe(typed)
		}
	})

	test("a multiplicação não guarda resíduo de ponto flutuante no total", () => {
		// 33,333 × 100 dá 3.333,2999999999997 em binário — e é o total que vai para o banco.
		expect(toStoredQuantity(33.333, "porcao", 100)).toBe(3333.3)
		expect(toStoredQuantity(0.07, "porcao", 3)).toBe(0.21)
	})

	test("na base total o número passa intacto — ali não houve conta a arredondar", () => {
		expect(toStoredQuantity(0.0000001, "total", 100)).toBe(0.0000001)
	})

	test("rendimento inválido cai em 1 — não devolve Infinity nem NaN para a tela", () => {
		expect(toStoredQuantity(2, "porcao", 0)).toBe(2)
		expect(fromStoredQuantity(2, "porcao", null)).toBe(2)
		expect(fromStoredQuantity(2, "porcao", Number.NaN)).toBe(2)
	})

	test("quantidade ausente ou não finita lê como zero", () => {
		expect(fromStoredQuantity(null, "porcao", 100)).toBe(0)
		expect(fromStoredQuantity(Number.NaN, "total", 100)).toBe(0)
		expect(toStoredQuantity(Number.NaN, "porcao", 100)).toBe(0)
	})

	test("trocar de base não altera o dado — só a leitura dele", () => {
		const stored = toStoredQuantity(0.5, "porcao", 100)
		expect(fromStoredQuantity(stored, "total", 100)).toBeCloseTo(50, 10)
		expect(fromStoredQuantity(stored, "porcao", 100)).toBeCloseTo(0.5, 10)
	})
})
