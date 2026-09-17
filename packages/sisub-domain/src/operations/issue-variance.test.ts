/**
 * Contrato da variância da saída do dia.
 *
 * O teste guarda as duas decisões que impedem o sistema de ensinar o operador a
 * mentir: o piso absoluto (200 g de sal não é "variância") e a ausência de
 * exigência quando não houve planejamento (cozinha que não planeja no sisub não
 * justifica o que o sistema nunca previu).
 */

import { describe, expect, test } from "bun:test"
import { checkDayClosure, evaluateVariance, type IssueToleranceSettings, roundToIssuePackage } from "./issue-variance.ts"

const SETTINGS: IssueToleranceSettings = { tolerancePct: 10, toleranceFloorValue: 20 }

describe("evaluateVariance", () => {
	test("dentro da tolerância não pede motivo", () => {
		const verdict = evaluateVariance({ ingredientId: "arroz", suggestedQty: 40, issuedNetQty: 42, unitCost: 5 }, SETTINGS)
		expect(verdict.deltaQty).toBe(2)
		expect(verdict.deltaPct).toBe(5)
		expect(verdict.requiresReason).toBe(false)
	})

	test("desvio grande em valor e em percentual pede motivo", () => {
		const verdict = evaluateVariance({ ingredientId: "carne", suggestedQty: 40, issuedNetQty: 60, unitCost: 30 }, SETTINGS)
		expect(verdict.deltaPct).toBe(50)
		expect(verdict.deltaValue).toBe(600)
		expect(verdict.requiresReason).toBe(true)
	})

	test("percentual grande em item barato NÃO pede motivo (piso absoluto)", () => {
		// 0,8 KG sugeridos, 1 KG emitidos: 25% de desvio, R$ 0,40 de diferença.
		// Sem o piso, esta linha entraria na lista de exceções todo dia.
		const verdict = evaluateVariance({ ingredientId: "sal", suggestedQty: 0.8, issuedNetQty: 1, unitCost: 2 }, SETTINGS)
		expect(verdict.deltaPct).toBe(25)
		expect(verdict.deltaValue).toBe(0.4)
		expect(verdict.requiresReason).toBe(false)
	})

	test("valor grande dentro do percentual não pede motivo", () => {
		// item caro com desvio de 5%: é o previsto para item caro, e exigir motivo
		// aqui transformaria o normal em exceção
		const verdict = evaluateVariance({ ingredientId: "picanha", suggestedQty: 100, issuedNetQty: 105, unitCost: 80 }, SETTINGS)
		expect(verdict.deltaValue).toBe(400)
		expect(verdict.requiresReason).toBe(false)
	})

	test("saída a menor também é desvio", () => {
		const verdict = evaluateVariance({ ingredientId: "carne", suggestedQty: 40, issuedNetQty: 20, unitCost: 30 }, SETTINGS)
		expect(verdict.deltaQty).toBe(-20)
		expect(verdict.requiresReason).toBe(true)
	})

	test("sem planejamento não há variância", () => {
		const verdict = evaluateVariance({ ingredientId: "feijao", suggestedQty: null, issuedNetQty: 30, unitCost: 8 }, SETTINGS)
		expect(verdict.requiresReason).toBe(false)
		expect(verdict.deltaPct).toBeNull()
	})

	test("item lançado fora da sugestão do dia também fica sem exigência", () => {
		// ele não foi previsto: cobrar motivo por isso é cobrar explicação de
		// algo que o planejamento nunca disse
		const verdict = evaluateVariance({ ingredientId: "cebola", suggestedQty: 0, issuedNetQty: 5, unitCost: 4 }, SETTINGS)
		expect(verdict.requiresReason).toBe(false)
	})
})

describe("roundToIssuePackage", () => {
	test("arredonda para cima na embalagem de saída", () => {
		// 3,37 KG de algo que só sai em saco de 5 KG
		expect(roundToIssuePackage(3.37, 5)).toBe(5)
		expect(roundToIssuePackage(11, 5)).toBe(15)
	})

	test("quantidade exata na embalagem não sobe", () => {
		expect(roundToIssuePackage(10, 5)).toBe(10)
	})

	test("item sem embalagem de saída mantém a quantidade", () => {
		expect(roundToIssuePackage(3.37, null)).toBe(3.37)
		expect(roundToIssuePackage(3.37, 0)).toBe(3.37)
	})
})

describe("checkDayClosure", () => {
	test("o dia não fecha com desvio relevante sem motivo", () => {
		const check = checkDayClosure(
			[
				{ ingredientId: "carne", suggestedQty: 40, issuedNetQty: 60, unitCost: 30 },
				{ ingredientId: "arroz", suggestedQty: 40, issuedNetQty: 41, unitCost: 5 },
			],
			SETTINGS
		)
		expect(check.canClose).toBe(false)
		expect(check.pending.map((verdict) => verdict.ingredientId)).toEqual(["carne"])
	})

	test("com o motivo informado, fecha", () => {
		const check = checkDayClosure([{ ingredientId: "carne", suggestedQty: 40, issuedNetQty: 60, unitCost: 30, reason: "headcount_change" }], SETTINGS)
		expect(check.canClose).toBe(true)
	})

	test("dia sem planejamento nenhum fecha sem pedir nada", () => {
		const check = checkDayClosure([{ ingredientId: "feijao", suggestedQty: null, issuedNetQty: 30, unitCost: 8 }], SETTINGS)
		expect(check.canClose).toBe(true)
	})
})
