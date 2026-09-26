import { type ExpenseExecutionStatus, emptyReceiptPendingCounts, type ReceivingPendingStatus } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildExpenseExecutionSteps } from "./expense-execution"
import { buildReceivingPendingIssues, describeReceiptPending, worstSeverity } from "./receiving-pending"

const base: ExpenseExecutionStatus = {
	unitId: 10,
	today: "2026-09-26",
	kitchens: [{ id: 1, name: "Rancho A", counts: emptyReceiptPendingCounts() }],
	empenhosWithoutOrigin: { count: 0, sample: [] },
	incompleteAcquisitions: { count: 0, sample: [] },
	dispensasWithoutValue: 0,
	dispensasOverLimitWithoutJustification: null,
	dispensaLimitMissing: false,
	supplyOrdersWithoutEmpenho: [],
	designations: { provisional: 2, definitive: 1 },
	siafiWaiting: [],
	unliquidated: { count: 0, oldestDays: null, divergent: 0 },
}
const step = (steps: ReturnType<typeof buildExpenseExecutionSteps>, id: string) => steps.find((s) => s.id === id)

describe("Executar despesa", () => {
	test("OM em dia: todas as etapas em dia", () => {
		expect(buildExpenseExecutionSteps(base).every((s) => s.status === "done")).toBe(true)
	})

	test("NE sem contratação de origem vira aviso com o número e leva aos empenhos", () => {
		const steps = buildExpenseExecutionSteps({
			...base,
			empenhosWithoutOrigin: { count: 1, sample: [{ id: "e", number: "2026NE000123", value: 500, supplier: null }] },
		})
		const origin = step(steps, "origin")
		expect(origin?.status).toBe("attention")
		expect(origin?.issues[0].message).toContain("2026NE000123")
		expect(origin?.issues[0].action?.href).toBe("/unit/10/empenhos")
	})

	test("pendência some quando o dado aparece (NE vinculada a uma dispensa)", () => {
		const withOrphan = buildExpenseExecutionSteps({
			...base,
			empenhosWithoutOrigin: { count: 1, sample: [{ id: "e", number: "X", value: 1, supplier: null }] },
		})
		expect(step(withOrphan, "origin")?.issues).toHaveLength(1)
		expect(step(buildExpenseExecutionSteps(base), "origin")?.issues).toHaveLength(0)
	})

	test("contratação incompleta diz o que falta; dispensa sem valor avisa que o somatório é um piso", () => {
		const steps = buildExpenseExecutionSteps({
			...base,
			incompleteAcquisitions: { count: 1, sample: [{ id: "a", kind: "dispensa", title: "Pão francês", missing: ["legal_basis", "supplier", "validity"] }] },
			dispensasWithoutValue: 2,
			dispensaLimitMissing: true,
		})
		const messages = step(steps, "origin")?.issues.map((i) => i.message) ?? []
		expect(messages[0]).toBe('"Pão francês" sem fundamento legal, fornecedor, vigência: complete a contratação.')
		expect(messages[1]).toMatch(/art\. 75, § 1º.*piso/)
		expect(messages[2]).toMatch(/limite de dispensa cadastrado para 2026/)
	})

	test("leitura tolerante: sem as colunas da contratação, a etapa não inventa pendência", () => {
		const steps = buildExpenseExecutionSteps({ ...base, incompleteAcquisitions: null, dispensasWithoutValue: null, dispensaLimitMissing: null })
		expect(step(steps, "origin")?.issues).toEqual([])
	})

	test("sem fiscal nem gestor designado: a etapa cita as alíneas do art. 140, II, e leva às designações", () => {
		const designations = step(buildExpenseExecutionSteps({ ...base, designations: { provisional: 0, definitive: 0 } }), "designations")
		expect(designations?.status).toBe("attention")
		expect(designations?.issues.map((i) => i.message).join(" ")).toMatch(/II, a.*II, b/)
		expect(designations?.issues[0].action?.href).toBe("/unit/10/designations")
	})

	test("OF enviada sem empenho bloqueia a etapa (não a OF)", () => {
		const orders = step(
			buildExpenseExecutionSteps({ ...base, supplyOrdersWithoutEmpenho: [{ id: "o", number: "12", kitchenName: "Rancho A", sentAt: "2026-09-20" }] }),
			"supply-orders"
		)
		expect(orders?.status).toBe("blocked")
		expect(orders?.issues[0].message).toMatch(/OF 12 \(Rancho A\).*Lei 4.320\/1964, art. 60/)
	})

	test("recebimento é do Estoque: diz quem resolve e não tem link", () => {
		const counts = { ...emptyReceiptPendingCounts(), without_invoice: 5, without_empenho: 1 }
		const receiving = step(buildExpenseExecutionSteps({ ...base, kitchens: [{ id: 1, name: "Rancho A", counts }] }), "receiving")
		expect(receiving?.issues[0].message).toBe(
			"Rancho A: 5 entregas sem NF-e, 1 entrega sem empenho. Quem vincula é o almoxarifado, no recebimento (Estoque → A caminho)."
		)
		expect(receiving?.issues[0].action).toBeUndefined()
	})

	test("NS estacionada à espera da NE leva ao SIAFI com o número da NE", () => {
		const siafi = step(buildExpenseExecutionSteps({ ...base, siafiWaiting: [{ reportType: "ns", count: 1, parents: ["2026NE000123"] }] }), "siafi")
		expect(siafi?.issues[0].message).toBe("1 NS aguardando a NE 2026NE000123: importe ou registre a NE, e ela se religa sozinha.")
	})

	test("recebimento atestado sem liquidação e SEFAZ pendente", () => {
		const counts = { ...emptyReceiptPendingCounts(), invoice_check_pending: 1 }
		const liquidation = step(
			buildExpenseExecutionSteps({ ...base, kitchens: [{ id: 1, name: "Rancho A", counts }], unliquidated: { count: 3, oldestDays: 12, divergent: 0 } }),
			"liquidation"
		)
		expect(liquidation?.issues[0].message).toBe("3 recebimentos atestados sem liquidação (o mais antigo há 12 dias).")
		expect(liquidation?.issues[1].severity).toBe("info")
	})
})

type PendingRow = ReceivingPendingStatus["receipts"][number]
const row = (over: Partial<PendingRow> = {}): PendingRow => ({
	receiptId: "r1",
	kitchenId: 1,
	source: "delivery_note",
	status: "definitive",
	createdAt: "2026-09-21T13:00:00Z",
	provisionalAt: null,
	definitiveAt: "2026-09-21T14:00:00Z",
	reference: "Guia 88",
	supplierName: "Padaria Central",
	invoiceExpected: true,
	nfeDocumentId: null,
	supplyOrderId: null,
	empenhoId: null,
	nfeSituationResult: null,
	nfeSituationCheckedAt: null,
	invoiceCheckDeferredAt: null,
	lines: 1,
	linesWithoutCost: 0,
	linesWithoutInvoiceItem: 0,
	liquidated: false,
	hasProvisionalDesignation: true,
	hasDefinitiveDesignation: true,
	pending: ["without_invoice", "without_empenho"],
	...over,
})

describe("pendências do recebimento (Estoque)", () => {
	test("uma linha por recebimento, com tudo o que falta e o atalho para ele", () => {
		const issues = buildReceivingPendingIssues({
			kitchenId: 1,
			today: "2026-09-26",
			receipts: [row()],
			counts: emptyReceiptPendingCounts(),
			canDesignate: false,
		})
		expect(issues).toEqual([
			{
				severity: "warning",
				message: "Guia 88 (Padaria Central), 21/09/2026: sem NF-e: vincule a nota quando ela chegar; sem empenho: vincule a NE (Lei 4.320/1964, art. 60).",
				action: { label: "Abrir recebimento", href: "/storage/1/receiving/r1" },
			},
		])
	})

	test("NF-e cancelada vem primeiro", () => {
		const issues = buildReceivingPendingIssues({
			kitchenId: 1,
			today: "2026-09-26",
			receipts: [row(), row({ receiptId: "r2", pending: ["nfe_cancelled"] })],
			counts: emptyReceiptPendingCounts(),
			canDesignate: false,
		})
		expect(issues[0].severity).toBe("blocking")
		expect(worstSeverity(["lines_without_invoice_item"])).toBe("info")
	})

	test("conferência sem fiscal: quem pode designa ali; quem não pode lê onde se designa", () => {
		expect(describeReceiptPending("conference_without_inspector", row(), true)).toMatch(/designe no recebimento/)
		expect(describeReceiptPending("conference_without_inspector", row(), false)).toMatch(/Gestão Unidade → Designações/)
	})
})
