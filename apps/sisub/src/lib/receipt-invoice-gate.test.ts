import { describe, expect, test } from "vitest"
import { liquidacaoLinkProblems } from "./invoice-gate"
import { DEFERRAL_REASON_MIN_LENGTH, decideReceiptInvoice } from "./receipt-invoice-gate"

const NOW = Date.parse("2026-09-26T15:00:00Z")
const fresh = { status: "imported", situationResult: "authorized", situationCheckedAt: "2026-09-26T12:00:00Z" }
const neverChecked = { status: "imported", situationResult: null, situationCheckedAt: null }
const reason = { reason: "Portal da SEFAZ fora do ar desde as 10h" }

describe("decideReceiptInvoice", () => {
	test("recebimento sem nota e nota consultada passam", () => {
		expect(decideReceiptInvoice(null, null, NOW)).toEqual({ kind: "ok" })
		expect(decideReceiptInvoice(fresh, null, NOW)).toEqual({ kind: "ok" })
	})

	test("SEFAZ fora do ar: sem motivo recusa e diz como seguir; com motivo efetiva pendente", () => {
		const refused = decideReceiptInvoice(neverChecked, null, NOW)
		expect(refused.kind).toBe("refuse")
		expect(refused.kind === "refuse" && refused.message).toMatch(/efetive com a consulta pendente/)
		expect(decideReceiptInvoice(neverChecked, reason, NOW).kind).toBe("defer")
	})

	test("motivo curto demais não basta", () => {
		const decision = decideReceiptInvoice(neverChecked, { reason: "fora" }, NOW)
		expect(decision.kind).toBe("refuse")
		expect(decision.kind === "refuse" && decision.message).toContain(String(DEFERRAL_REASON_MIN_LENGTH))
	})

	test("consulta velha também pode ser adiada", () => {
		expect(decideReceiptInvoice({ ...fresh, situationCheckedAt: "2026-09-01T12:00:00Z" }, reason, NOW).kind).toBe("defer")
	})

	test("nota cancelada nunca se adia", () => {
		expect(decideReceiptInvoice({ ...fresh, situationResult: "cancelled" }, reason, NOW).kind).toBe("refuse")
		expect(decideReceiptInvoice({ ...fresh, status: "cancelled" }, reason, NOW).kind).toBe("refuse")
	})

	test("a liquidação do recebimento efetivado com a consulta pendente continua recusada", () => {
		// O adiamento é da efetivação. A regra da liquidação não muda: sem consulta recente, não paga.
		const problems = liquidacaoLinkProblems(
			{
				unitId: 1,
				empenhoId: "ne",
				receipt: { unitId: 1, status: "definitive", definitiveAt: "2026-09-26T14:00:00Z", nfeDocumentId: "nfe", empenhoId: "ne", fiscalPending: false },
				requestedNfeId: null,
				invoice: { ...neverChecked, unitId: 1 },
			},
			NOW
		)
		expect(problems.some((p) => /Consulte a situação da NF-e/.test(p))).toBe(true)
	})
})
