import { describe, expect, test } from "bun:test"
import { empenhoEventSign, isAnnulmentEvent, isTotalAnnulmentEvent } from "./empenho-events.ts"
import {
	deductionExceedsProblem,
	deductionPaymentProblem,
	isLiquidationWithoutReceipt,
	liquidationExceedsReceiptProblem,
	liquidationNetBalance,
	paymentExceedsNetProblem,
	receiptLiquidationCeiling,
} from "./liquidation-math.ts"
import { empenhoBalanceAtYearEnd, legacyRestosAPagarKind, reconcileRestosAPagar, splitRestosAPagar } from "./restos-a-pagar-math.ts"

describe("restos a pagar em duas parcelas", () => {
	test("o mesmo empenho tem RP processado e não processado", () => {
		// vigente 10.000, liquidado 6.000, pago 4.000
		expect(splitRestosAPagar({ valorVigente: 10_000, valorLiquidado: 6_000, valorPago: 4_000 })).toEqual({ processado: 2_000, naoProcessado: 4_000 })
	})

	test("empenho quitado não gera RP; saldo incoerente não vira parcela negativa", () => {
		expect(splitRestosAPagar({ valorVigente: 5_000, valorLiquidado: 5_000, valorPago: 5_000 })).toEqual({ processado: 0, naoProcessado: 0 })
		expect(splitRestosAPagar({ valorVigente: 5_000, valorLiquidado: 6_000, valorPago: 7_000 })).toEqual({ processado: 0, naoProcessado: 0 })
	})

	const noLegacy = { rpInscrito: false, rpExercicio: null }

	test("primeira inscrição grava as duas parcelas", () => {
		const action = reconcileRestosAPagar({ empenhoId: "a", exercicio: 2026, split: { processado: 2_000, naoProcessado: 4_000 }, active: [], legacy: noLegacy })
		expect(action.kind).toBe("insert")
		expect(action.parcels).toEqual([
			{ empenhoId: "a", exercicio: 2026, tipo: "processado", valor: 2_000 },
			{ empenhoId: "a", exercicio: 2026, tipo: "nao_processado", valor: 4_000 },
		])
	})

	test("rodar de novo com o mesmo saldo de 31/12 não faz nada (e o botão não fica pendente)", () => {
		const action = reconcileRestosAPagar({
			empenhoId: "a",
			exercicio: 2026,
			split: { processado: 2_000, naoProcessado: 4_000 },
			active: [
				{ id: "p1", kind: "processado", amount: 2_000 },
				{ id: "p2", kind: "nao_processado", amount: 4_000 },
			],
			legacy: noLegacy,
		})
		expect(action.kind).toBe("none")
	})

	test("NS retroativa a 31/12 depois da inscrição: o conjunto é substituído, nunca somado", () => {
		// vigente 100: 1ª inscrição gravou não processado 100. Depois entra NS de 40 datada de dezembro.
		const action = reconcileRestosAPagar({
			empenhoId: "a",
			exercicio: 2026,
			split: { processado: 40, naoProcessado: 60 },
			active: [{ id: "np", kind: "nao_processado", amount: 100 }],
			legacy: noLegacy,
		})
		expect(action.kind).toBe("replace")
		expect(action.supersede).toEqual(["np"])
		// o total inscrito continua 100, não 140
		expect(action.parcels.reduce((acc, p) => acc + p.valor, 0)).toBe(100)
	})

	test("empenho inscrito pelo caminho antigo vira parcelas, sem inscrever de novo", () => {
		const legacy = reconcileRestosAPagar({
			empenhoId: "a",
			exercicio: 2026,
			split: { processado: 2_000, naoProcessado: 4_000 },
			active: [],
			legacy: { rpInscrito: true, rpExercicio: 2026 },
		})
		expect(legacy.kind).toBe("migrate_legacy")
		// inscrição antiga de OUTRO exercício não conta
		expect(
			reconcileRestosAPagar({
				empenhoId: "a",
				exercicio: 2026,
				split: { processado: 1, naoProcessado: 0 },
				active: [],
				legacy: { rpInscrito: true, rpExercicio: 2025 },
			}).kind
		).toBe("insert")
	})

	test("o saldo é o de 31/12: OB paga em janeiro não reduz o RP processado", () => {
		const balance = empenhoBalanceAtYearEnd(
			{
				valorOriginal: 10_000,
				events: [
					{ tipo: "reforco", valor: 1_000, data: "2026-11-10" },
					// anulação de janeiro é do RP, não do saldo de 31/12
					{ tipo: "anulacao", valor: 500, data: "2027-01-08" },
					{ tipo: "rp_inscricao", valor: 9_999, data: "2026-12-31" },
				],
				liquidacoes: [
					{ valor: 6_000, data: "2026-12-20" },
					{ valor: 2_000, data: "2027-01-15" },
				],
				pagamentos: [
					{ valor: 3_000, data: "2026-12-28" },
					{ valor: 2_500, data: "2027-01-05" },
				],
				retencoesRecolhidas: [
					{ valor: 351, data: "2026-12-30" },
					{ valor: 149, data: "2027-01-05" },
				],
			},
			2026
		)
		expect(balance).toEqual({ valorVigente: 11_000, valorLiquidado: 6_000, valorPago: 3_351 })
		expect(splitRestosAPagar(balance)).toEqual({ processado: 2_649, naoProcessado: 5_000 })
	})

	test("o rp_tipo legado segue a escolha antiga", () => {
		expect(legacyRestosAPagarKind({ processado: 2_000, naoProcessado: 4_000 })).toBe("nao_processado")
		expect(legacyRestosAPagarKind({ processado: 2_000, naoProcessado: 0 })).toBe("processado")
		expect(legacyRestosAPagarKind({ processado: 0, naoProcessado: 0 })).toBeNull()
	})
})

describe("OB pelo líquido", () => {
	const bruto = 10_000

	test("sem dedução, o líquido é o bruto (comportamento anterior)", () => {
		const balance = liquidationNetBalance({ bruto, deducoes: [], pagamentos: [4_000] })
		expect(balance).toEqual({ bruto, deducoes: 0, liquido: 10_000, pago: 4_000, aPagar: 6_000, aRecolher: 0 })
		expect(paymentExceedsNetProblem(balance, 6_000)).toBeNull()
		expect(paymentExceedsNetProblem(balance, 6_000.01)).toContain("valor liquidado")
	})

	test("com DARF, a OB paga o líquido e o teto é o líquido", () => {
		const balance = liquidationNetBalance({
			bruto,
			deducoes: [
				{ valor: 480, recolhidaEm: "2026-09-20" }, // IR, já recolhido por DARF
				{ valor: 105, recolhidaEm: null }, // CSLL/PIS/COFINS ainda a recolher
			],
			pagamentos: [],
		})
		expect(balance.liquido).toBe(9_415)
		expect(balance.aRecolher).toBe(105)
		expect(paymentExceedsNetProblem(balance, 9_415)).toBeNull()
		const problem = paymentExceedsNetProblem(balance, 10_000)
		expect(problem).toContain("líquido")
		expect(problem).toContain("9415.00")
	})

	test("dedução que passaria o que resta da NS é recusada", () => {
		const balance = liquidationNetBalance({ bruto, deducoes: [{ valor: 500, recolhidaEm: null }], pagamentos: [9_000] })
		expect(deductionExceedsProblem(balance, 500)).toBeNull()
		expect(deductionExceedsProblem(balance, 500.01)).toContain("Registre a retenção antes da OB")
	})
})

describe("recolhimento da retenção", () => {
	test("retenção ainda não recolhida aceita o registro do DARF", () => {
		expect(deductionPaymentProblem({ paidOn: null, documentNumber: null })).toBeNull()
	})

	test("retenção já recolhida não é sobrescrita", () => {
		const problem = deductionPaymentProblem({ paidOn: "2026-09-20", documentNumber: "0000000000000001" })
		expect(problem).toContain("já foi recolhida em 2026-09-20")
		expect(problem).toContain("0000000000000001")
	})
})

describe("teto da liquidação pelo recebido", () => {
	test("com todos os itens precificados, vale Σ quantidade × custo", () => {
		const ceiling = receiptLiquidationCeiling(
			[
				{ receivedQtyBase: 96, unitCost: 100 },
				{ receivedQtyBase: 10, unitCost: 2.5 },
			],
			99_999
		)
		expect(ceiling).toEqual({ basis: "itens", value: 9_625, unpricedItems: 0 })
		expect(liquidationExceedsReceiptProblem({ ceiling, alreadyLiquidated: 9_000, valor: 625 })).toBeNull()
		expect(liquidationExceedsReceiptProblem({ ceiling, alreadyLiquidated: 9_000, valor: 626 })).toContain("no máximo R$ 625.00")
	})

	test("item sem custo: vale o total da NF-e; sem NF-e, teto indeterminado (não recusa)", () => {
		const items = [
			{ receivedQtyBase: 96, unitCost: 100 },
			{ receivedQtyBase: 10, unitCost: null },
		]
		const withNfe = receiptLiquidationCeiling(items, 9_700)
		expect(withNfe).toEqual({ basis: "nfe", value: 9_700, unpricedItems: 1 })
		expect(liquidationExceedsReceiptProblem({ ceiling: withNfe, alreadyLiquidated: 0, valor: 9_800 })).toContain("total da NF-e")

		const without = receiptLiquidationCeiling(items, null)
		expect(without.basis).toBe("indeterminado")
		expect(liquidationExceedsReceiptProblem({ ceiling: without, alreadyLiquidated: 0, valor: 1_000_000 })).toBeNull()
	})

	test("liquidação sem recebimento é pendência, não recusa", () => {
		expect(isLiquidationWithoutReceipt({ goodsReceiptId: null })).toBe(true)
		expect(isLiquidationWithoutReceipt({ goodsReceiptId: "r1" })).toBe(false)
	})
})

describe("anulação total: nome novo e legado", () => {
	test("os dois reduzem o vigente e passam pelo piso", () => {
		for (const tipo of ["anulacao_total", "cancelamento"]) {
			expect(isTotalAnnulmentEvent(tipo)).toBe(true)
			expect(isAnnulmentEvent(tipo)).toBe(true)
			expect(empenhoEventSign(tipo)).toBe(-1)
		}
		expect(isTotalAnnulmentEvent("anulacao")).toBe(false)
		expect(empenhoEventSign("reforco")).toBe(1)
		expect(empenhoEventSign("rp_inscricao")).toBe(0)
	})
})
