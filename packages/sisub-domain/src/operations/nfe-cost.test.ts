/**
 * Contrato do custo de aquisição por item da NF-e.
 *
 * O caso que motiva o módulo: nota com frete. Somando só `vProd`, o estoque
 * entra subvalorizado na exata proporção do frete — e em entrega diária de
 * hortifrúti o frete é parte relevante do preço. O outro caso é a soma dos
 * itens não fechar com o `vNF`: centavo de arredondamento é absorvido, mas
 * diferença grande tem de FICAR VISÍVEL em vez de ser escondida numa linha.
 */

import { describe, expect, test } from "bun:test"
import { computeNfeItemCosts } from "./nfe-cost.ts"

describe("computeNfeItemCosts", () => {
	test("frete e desconto entram no custo do item", () => {
		const result = computeNfeItemCosts([{ nItem: 1, productValue: 1000, discount: 50, freight: 30, baseQuantity: 100 }], 980)
		expect(result.items[0]?.totalCost).toBe(980)
		expect(result.items[0]?.unitCostBase).toBe(9.8)
		expect(result.invoiceDifference).toBe(0)
	})

	test("tributos não recuperáveis somam (o órgão não credita ICMS-ST nem IPI)", () => {
		const result = computeNfeItemCosts([{ nItem: 1, productValue: 100, ipi: 5, icmsSt: 8, fcpSt: 2, baseQuantity: 10 }], 115)
		expect(result.items[0]?.totalCost).toBe(115)
		expect(result.items[0]?.unitCostBase).toBe(11.5)
	})

	test("sem quantidade base, o custo unitário fica nulo em vez de chutar", () => {
		// é o item cujo matching não resolveu a conversão: ele NÃO pode entrar no
		// ledger valorado, e um custo inventado é pior que custo ausente
		const result = computeNfeItemCosts([{ nItem: 1, productValue: 100, baseQuantity: null }], 100)
		expect(result.items[0]?.unitCostBase).toBeNull()
	})

	test("centavo de arredondamento vai para a linha de maior valor", () => {
		const result = computeNfeItemCosts(
			[
				{ nItem: 1, productValue: 33.33, baseQuantity: 1 },
				{ nItem: 2, productValue: 33.33, baseQuantity: 1 },
				{ nItem: 3, productValue: 33.33, baseQuantity: 1 },
			],
			100
		)
		expect(result.total).toBe(100)
		// as três linhas somam 99,99: o centavo entra na primeira de maior valor
		expect(result.items.map((item) => item.totalCost).reduce((a, b) => a + b, 0)).toBe(100)
		expect(result.invoiceDifference).toBe(0)
	})

	test("diferença grande contra o vNF é reportada, não absorvida", () => {
		const result = computeNfeItemCosts([{ nItem: 1, productValue: 100, baseQuantity: 10 }], 250)
		expect(result.items[0]?.totalCost).toBe(100)
		expect(result.invoiceDifference).toBe(150)
	})

	test("sem total da nota, calcula os itens e não reporta diferença", () => {
		const result = computeNfeItemCosts([{ nItem: 1, productValue: 10, baseQuantity: 2 }], null)
		expect(result.total).toBe(10)
		expect(result.invoiceDifference).toBe(0)
	})

	test("nota vazia não estoura", () => {
		const result = computeNfeItemCosts([], 0)
		expect(result.items).toEqual([])
		expect(result.total).toBe(0)
	})
})
