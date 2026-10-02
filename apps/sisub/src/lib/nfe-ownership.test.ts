/**
 * De quem é a NF-e. Cada caso é um furo que já esteve aberto: cozinha assumindo nota da triagem
 * global (`unit_id` nulo) e recebendo mercadoria por nota de outra OM.
 */
import { describe, expect, test } from "vitest"
import { nfeOwnershipProblem } from "@/lib/nfe-ownership"

const KITCHEN = 7
const UNIT = 5
const OTHER_UNIT = 6

describe("nfeOwnershipProblem — assumir a nota ou receber por ela", () => {
	test("nota já desta cozinha passa, mesmo sem unidade", () => {
		expect(nfeOwnershipProblem({ docKitchenId: KITCHEN, docUnitId: null, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toBeNull()
	})

	test("nota desta cozinha, mas com destinatário de outra unidade, não passa", () => {
		expect(nfeOwnershipProblem({ docKitchenId: KITCHEN, docUnitId: OTHER_UNIT, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toMatch(/outra unidade/)
	})

	test("nota de outra cozinha não passa", () => {
		expect(nfeOwnershipProblem({ docKitchenId: 8, docUnitId: UNIT, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toMatch(/outra cozinha/)
	})

	test("nota da unidade de compra da cozinha, sem cozinha, passa", () => {
		expect(nfeOwnershipProblem({ docKitchenId: null, docUnitId: UNIT, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toBeNull()
	})

	test("nota endereçada a outra unidade não passa", () => {
		expect(nfeOwnershipProblem({ docKitchenId: null, docUnitId: OTHER_UNIT, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toMatch(/outra unidade/)
	})

	test("nota em triagem global (sem unidade) não passa e diz quem resolve", () => {
		expect(nfeOwnershipProblem({ docKitchenId: null, docUnitId: null, kitchenId: KITCHEN, kitchenPurchaseUnitId: UNIT })).toMatch(/triagem/)
	})

	test("cozinha sem unidade de compra não assume nota de unidade", () => {
		expect(nfeOwnershipProblem({ docKitchenId: null, docUnitId: UNIT, kitchenId: KITCHEN, kitchenPurchaseUnitId: null })).toMatch(/sem unidade de compra/)
	})
})
