import { describe, expect, test } from "bun:test"
import {
	type AcquisitionForStatus,
	countReceiptPending,
	groupSiafiWaiting,
	type ReceiptPendingRow,
	receiptPendingKinds,
	summarizeAcquisitions,
} from "./expense-execution.ts"

const receipt = (over: Partial<ReceiptPendingRow> = {}): ReceiptPendingRow => ({
	receiptId: "r1",
	kitchenId: 1,
	source: "nfe",
	status: "definitive",
	createdAt: "2026-09-21T11:00:00Z",
	provisionalAt: "2026-09-21T11:10:00Z",
	definitiveAt: "2026-09-21T12:00:00Z",
	reference: "NF-e 000000123",
	supplierName: null,
	invoiceExpected: true,
	nfeDocumentId: "nfe",
	supplyOrderId: "of",
	empenhoId: "ne",
	nfeSituationResult: "authorized",
	nfeSituationCheckedAt: "2026-09-21T10:00:00Z",
	invoiceCheckDeferredAt: null,
	lines: 3,
	linesWithoutCost: 0,
	linesWithoutInvoiceItem: 0,
	liquidated: false,
	hasProvisionalDesignation: true,
	hasDefinitiveDesignation: true,
	...over,
})

describe("receiptPendingKinds", () => {
	test("recebimento completo não tem pendência", () => {
		expect(receiptPendingKinds(receipt())).toEqual([])
	})

	test("recusado nunca tem pendência: a entrega não foi aceita", () => {
		expect(receiptPendingKinds(receipt({ status: "rejected", nfeDocumentId: null, empenhoId: null }))).toEqual([])
	})

	test("pão com guia: sem NF-e, sem OF e sem empenho até vincular", () => {
		const kinds = receiptPendingKinds(receipt({ source: "delivery_note", nfeDocumentId: null, supplyOrderId: null, empenhoId: null }))
		expect(kinds).toEqual(["without_invoice", "without_empenho", "without_supply_order"])
	})

	test("pendência some quando o dado aparece (NF-e vinculada depois)", () => {
		expect(receiptPendingKinds(receipt({ source: "delivery_note" }))).toEqual([])
	})

	test("remessa de depósito não espera nota nem empenho", () => {
		expect(
			receiptPendingKinds(receipt({ source: "delivery_note", invoiceExpected: false, nfeDocumentId: null, supplyOrderId: null, empenhoId: null }))
		).toEqual([])
	})

	test("conferência registrada sem fiscal designado para a entrega", () => {
		const draft = receipt({ status: "draft", provisionalAt: null, definitiveAt: null, hasProvisionalDesignation: false, hasDefinitiveDesignation: false })
		expect(receiptPendingKinds(draft)).toEqual(["conference_without_inspector"])
		// rascunho sem linha ainda não é conferência
		expect(receiptPendingKinds({ ...draft, lines: 0 })).toEqual([])
	})

	test("provisório feito, definitivo sem gestor nem comissão", () => {
		expect(receiptPendingKinds(receipt({ status: "provisional", definitiveAt: null, hasDefinitiveDesignation: false }))).toEqual([
			"provisional_without_manager",
		])
	})

	test("SEFAZ fora do ar na efetivação: pendente até a consulta autorizada DEPOIS", () => {
		const deferred = receipt({ invoiceCheckDeferredAt: "2026-09-21T12:00:00Z", nfeSituationCheckedAt: "2026-09-20T10:00:00Z", nfeSituationResult: "unknown" })
		expect(receiptPendingKinds(deferred)).toEqual(["invoice_check_pending"])
		expect(receiptPendingKinds({ ...deferred, nfeSituationResult: "authorized", nfeSituationCheckedAt: "2026-09-22T09:00:00Z" })).toEqual([])
		// consulta autorizada ANTES da efetivação não resolve: ela era a que a SEFAZ não confirmou
		expect(receiptPendingKinds({ ...deferred, nfeSituationResult: "authorized" })).toEqual(["invoice_check_pending"])
	})

	test("NF-e cancelada depois da efetivação bloqueia a etapa", () => {
		expect(receiptPendingKinds(receipt({ nfeSituationResult: "cancelled" }))).toEqual(["nfe_cancelled"])
	})

	test("linha efetivada sem custo e linha sem item da nota casado", () => {
		expect(receiptPendingKinds(receipt({ linesWithoutCost: 1, linesWithoutInvoiceItem: 2 }))).toEqual(["lines_without_cost", "lines_without_invoice_item"])
	})
})

describe("countReceiptPending", () => {
	test("conta recebimentos por pendência", () => {
		const counts = countReceiptPending([
			receipt({ nfeDocumentId: null }),
			receipt({ nfeDocumentId: null, empenhoId: null }),
			receipt({ status: "rejected", nfeDocumentId: null }),
		])
		expect(counts.without_invoice).toBe(2)
		expect(counts.without_empenho).toBe(1)
		expect(counts.nfe_cancelled).toBe(0)
	})
})

describe("groupSiafiWaiting", () => {
	test("agrupa NS e OB estacionadas pelo documento pai que falta", () => {
		expect(
			groupSiafiWaiting([
				{ reportType: "ns", parent: "2026ne000123" },
				{ reportType: "ns", parent: "2026NE000123" },
				{ reportType: "ob", parent: null },
				{ reportType: "ne", parent: "x" },
			])
		).toEqual([
			{ reportType: "ns", count: 2, parents: ["2026NE000123"] },
			{ reportType: "ob", count: 1, parents: [] },
		])
	})
})

describe("summarizeAcquisitions", () => {
	const limits = [{ clause: "II", validFrom: "2026-01-01", value: 65492.11, sourceAct: "Decreto nº 12.807/2025" }]
	const acquisition = (over: Partial<AcquisitionForStatus> = {}): AcquisitionForStatus => ({
		id: "a1",
		label: "Dispensa — carnes",
		kind: "dispensa",
		srpRole: null,
		legalBasis: "Lei 14.133/2021, art. 75, II",
		directContractClause: "II",
		nd: "33903007",
		activityLine: "8905",
		object: "Carnes para a formatura",
		supplierCnpj: "12345678000190",
		supplierName: "Frigorífico",
		validFrom: "2026-09-01",
		validTo: "2026-12-31",
		estimatedValue: 20000,
		overLimitJustification: null,
		fiscalYear: 2026,
		committedValue: 0,
		...over,
	})

	test("dispensa completa dentro do limite não tem pendência", () => {
		const summary = summarizeAcquisitions([acquisition()], limits, 2026)
		expect(summary.incomplete.count).toBe(0)
		expect(summary.dispensasOverLimitWithoutJustification).toBe(0)
	})

	test("terceira dispensa de carnes passa do limite: pendência de justificativa até gravá-la", () => {
		const three = [
			acquisition({ id: "a1", estimatedValue: 30000 }),
			acquisition({ id: "a2", estimatedValue: 18000 }),
			acquisition({ id: "a3", estimatedValue: 20000 }),
		]
		const over = summarizeAcquisitions(three, limits, 2026)
		expect(over.dispensasOverLimitWithoutJustification).toBe(3)
		expect(over.incomplete.sample[0]?.summary).toMatch(/justificativa do somatório/)
		const justified = summarizeAcquisitions(
			three.map((a) => ({ ...a, overLimitJustification: "Fracionamento afastado: fornecimentos distintos" })),
			limits,
			2026
		)
		expect(justified.dispensasOverLimitWithoutJustification).toBe(0)
	})

	test("dispensa sem valor nenhum conta como sem valor, não como zero", () => {
		const summary = summarizeAcquisitions([acquisition({ estimatedValue: null, committedValue: 0 })], limits, 2026)
		expect(summary.dispensasWithoutValue).toBe(1)
		expect(summary.incomplete.sample[0]?.summary).toMatch(/sem valor/)
	})

	test("inciso sem limite no exercício pede o cadastro", () => {
		// falta o inciso I
		expect(summarizeAcquisitions([], limits, 2026).dispensaLimitMissing).toBe(true)
		const both = [...limits, { clause: "I", validFrom: "2026-01-01", value: 130984.2, sourceAct: "Decreto nº 12.807/2025" }]
		expect(summarizeAcquisitions([], both, 2026).dispensaLimitMissing).toBe(false)
	})
})
