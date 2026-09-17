/**
 * Contrato do casamento da leitura com a linha da nota.
 *
 * Os dois falsos negativos que existiam na tela antiga estão aqui como teste:
 * item casado pelo mapa do fornecedor (SKU sem GTIN) e leitura da unidade
 * quando o catálogo conhece a caixa. Os dois diziam "NÃO consta nesta nota"
 * para item que estava na nota — e é assim que o conferente aprende a ignorar
 * o aviso.
 */

import { describe, expect, test } from "bun:test"
import { fiscalShortfallValue, lineProgress, matchScanToLine, type ReceiptLineForScan, suggestedMultiplier, withinTolerance } from "./receiving-scan.ts"

const CAIXA = "17891234567892"
const UNIDADE = "07891234567895"

function line(overrides: Partial<ReceiptLineForScan> = {}): ReceiptLineForScan {
	return {
		receiptItemId: "item-1",
		invoiceGtin: CAIXA,
		invoiceGtinTrib: UNIDADE,
		catalogGtins: [],
		hierarchyGtins: [],
		commercialQty: 10,
		taxableQty: 120,
		invoicedQtyBase: 600, // 10 caixas × 60 KG
		confirmedQtyBase: 0,
		...overrides,
	}
}

describe("matchScanToLine", () => {
	test("lendo a caixa (cEAN): uma leitura é uma embalagem comercial", () => {
		const match = matchScanToLine(CAIXA, [line()])
		expect(match?.source).toBe("invoice_gtin")
		expect(match?.packageFactor).toBe(1)
		expect(match?.quantityBase).toBe(60)
	})

	test("lendo a unidade (cEANTrib): fator qCom/qTrib", () => {
		// 10 CX = 120 UN → uma unidade é 1/12 de caixa = 5 KG
		const match = matchScanToLine(UNIDADE, [line()])
		expect(match?.source).toBe("invoice_gtin_trib")
		expect(match?.packageFactor).toBeCloseTo(1 / 12, 6)
		expect(match?.quantityBase).toBe(5)
	})

	test("item casado pelo mapa do fornecedor: a nota não tem GTIN, o catálogo tem", () => {
		// era o falso negativo nº 1 — "não consta na nota" para item da nota
		const match = matchScanToLine(UNIDADE, [line({ invoiceGtin: null, invoiceGtinTrib: null, catalogGtins: [UNIDADE] })])
		expect(match?.source).toBe("catalog_gtin")
		expect(match?.packageFactor).toBe(1)
	})

	test("hierarquia de embalagem resolve caixa × unidade do catálogo", () => {
		// falso negativo nº 2: o SKU conhece a caixa, o operador leu a unidade
		const match = matchScanToLine(UNIDADE, [line({ invoiceGtin: null, invoiceGtinTrib: null, catalogGtins: [CAIXA], hierarchyGtins: [UNIDADE] })])
		expect(match?.source).toBe("package_hierarchy")
	})

	test("a nota vence o catálogo quando as duas casam", () => {
		const match = matchScanToLine(CAIXA, [line({ catalogGtins: [CAIXA] })])
		expect(match?.source).toBe("invoice_gtin")
	})

	test("código desconhecido não casa com nada — quem decide é o operador", () => {
		expect(matchScanToLine("07899999999992", [line()])).toBeNull()
	})

	test("sem qCom/qTrib, o fator é 1 e a tela mostra o que foi aplicado", () => {
		const match = matchScanToLine(UNIDADE, [line({ commercialQty: null, taxableQty: null })])
		expect(match?.packageFactor).toBe(1)
	})

	test("linha sem conversão para a unidade base conta a embalagem, não a quantidade", () => {
		const match = matchScanToLine(CAIXA, [line({ invoicedQtyBase: null })])
		expect(match?.receiptItemId).toBe("item-1")
		expect(match?.quantityBase).toBeNull()
	})

	test("escolhe a linha certa entre várias", () => {
		const outra = line({ receiptItemId: "item-2", invoiceGtin: "07891111111117", invoiceGtinTrib: null })
		const match = matchScanToLine(CAIXA, [outra, line()])
		expect(match?.receiptItemId).toBe("item-1")
	})
})

describe("lineProgress", () => {
	test("falta e excesso por linha", () => {
		const [faltando, excedido] = lineProgress([line({ confirmedQtyBase: 540 }), line({ receiptItemId: "item-2", confirmedQtyBase: 660 })])
		expect(faltando?.remainingQtyBase).toBe(60)
		expect(faltando?.over).toBe(false)
		expect(excedido?.remainingQtyBase).toBe(-60)
		expect(excedido?.over).toBe(true)
	})

	test("linha sem faturado não tem 'falta'", () => {
		const [row] = lineProgress([line({ invoicedQtyBase: null })])
		expect(row?.remainingQtyBase).toBeNull()
	})
})

describe("suggestedMultiplier", () => {
	test("sugere o restante em embalagens", () => {
		// 600 KG faturados, 60 KG por caixa, nada conferido → 10 caixas
		expect(suggestedMultiplier(line(), 60)).toBe(10)
	})

	test("desconta o que já foi conferido", () => {
		expect(suggestedMultiplier(line({ confirmedQtyBase: 420 }), 60)).toBe(3)
	})

	test("linha completa não sugere multiplicador", () => {
		expect(suggestedMultiplier(line({ confirmedQtyBase: 600 }), 60)).toBeNull()
	})

	test("sem quantidade por leitura não há sugestão", () => {
		expect(suggestedMultiplier(line(), null)).toBeNull()
	})
})

describe("withinTolerance", () => {
	test("peso variável dentro de 2%", () => {
		expect(withinTolerance(20, 19.7, 2)).toBe(true)
		expect(withinTolerance(20, 19.5, 2)).toBe(false)
	})

	test("recebimento a maior também respeita a tolerância", () => {
		expect(withinTolerance(20, 20.3, 2)).toBe(true)
	})

	test("sem faturado não há tolerância a aplicar", () => {
		expect(withinTolerance(null, 10, 2)).toBe(false)
	})
})

describe("fiscalShortfallValue", () => {
	test("soma o valor do que foi faturado e não chegou", () => {
		// a pendência existe mesmo dentro da tolerância: a nota continua dizendo
		// 100 e o estoque, 90
		expect(
			fiscalShortfallValue([
				{ invoicedQtyBase: 100, receivedQtyBase: 90, unitCost: 5 },
				{ invoicedQtyBase: 20, receivedQtyBase: 20, unitCost: 3 },
			])
		).toBe(50)
	})

	test("recebimento a maior não gera pendência fiscal", () => {
		expect(fiscalShortfallValue([{ invoicedQtyBase: 100, receivedQtyBase: 110, unitCost: 5 }])).toBe(0)
	})

	test("linha sem custo ou sem faturado fica fora da conta", () => {
		expect(
			fiscalShortfallValue([
				{ invoicedQtyBase: 100, receivedQtyBase: 90, unitCost: null },
				{ invoicedQtyBase: null, receivedQtyBase: 90, unitCost: 5 },
			])
		).toBe(0)
	})
})
