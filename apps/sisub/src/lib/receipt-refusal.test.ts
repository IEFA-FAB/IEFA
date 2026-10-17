import { afterEach, describe, expect, test, vi } from "vitest"
import {
	canCompleteInvoiceRefusal,
	formatInvoiceRevertFailedMessage,
	formatReceiptRefusalNotRecordedMessage,
	planReceiptRefusal,
	resolveRefusalLostRace,
} from "./receipt-refusal"

const NFE = "00000000-0000-4000-8000-000000000001"
const REASON = { reason: "Carne fora da temperatura", isInvoiceInOtherReceipt: false }

describe("planReceiptRefusal", () => {
	test("recebimento aberto criado da nota: a NF-e é marcada (antes do recebimento), a partir da situação lida", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "nfe" }, { status: "matched" }, REASON)).toEqual({
			rejectReceipt: true,
			invoiceToRefuse: { id: NFE, previousStatus: "matched" },
			isInvoiceRefused: true,
		})
		expect(planReceiptRefusal({ status: "provisional", nfe_document_id: NFE, source: "nfe" }, { status: "available" }, REASON).invoiceToRefuse).toEqual({
			id: NFE,
			previousStatus: "available",
		})
	})

	test("NF-e semanal vinculada à entrega do dia não vira recusada", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "delivery_note" }, null, REASON)).toEqual({
			rejectReceipt: true,
			invoiceToRefuse: null,
			isInvoiceRefused: false,
		})
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: null, source: "nfe" }, null, REASON).invoiceToRefuse).toBeNull()
	})

	test("efetivado não se recusa", () => {
		expect(() => planReceiptRefusal({ status: "definitive", nfe_document_id: NFE, source: "nfe" }, { status: "matched" }, REASON)).toThrow(
			"Recebimento já efetivado"
		)
		expect(() => planReceiptRefusal({ status: "divergent", nfe_document_id: null, source: "delivery_note" }, null, REASON)).toThrow("Recebimento já efetivado")
	})

	test("recusar o aberto exige motivo", () => {
		expect(() =>
			planReceiptRefusal({ status: "draft", nfe_document_id: null, source: "ad_hoc" }, null, { reason: "  ab ", isInvoiceInOtherReceipt: false })
		).toThrow("Informe o motivo da recusa (ao menos 5 caracteres)")
		expect(() =>
			planReceiptRefusal({ status: "draft", nfe_document_id: null, source: "ad_hoc" }, null, { reason: undefined, isInvoiceInOtherReceipt: false })
		).toThrow("Informe o motivo")
	})

	test("estado parcial (nota recusada, recebimento aberto): repetir recusa o recebimento sem reescrever a nota", () => {
		expect(planReceiptRefusal({ status: "provisional", nfe_document_id: NFE, source: "nfe" }, { status: "refused" }, REASON)).toEqual({
			rejectReceipt: true,
			invoiceToRefuse: null,
			isInvoiceRefused: true,
		})
	})

	test("nota cancelada na SEFAZ não vira recusada: a situação mais forte fica", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "nfe" }, { status: "cancelled" }, REASON)).toEqual({
			rejectReceipt: true,
			invoiceToRefuse: null,
			isInvoiceRefused: false,
		})
	})

	test("recusado na ordem antiga, com a nota aceita: só completa a marca da NF-e (sem motivo novo)", () => {
		expect(
			planReceiptRefusal(
				{ status: "rejected", nfe_document_id: NFE, source: "nfe" },
				{ status: "matched" },
				{ reason: undefined, isInvoiceInOtherReceipt: false }
			)
		).toEqual({ rejectReceipt: false, invoiceToRefuse: { id: NFE, previousStatus: "matched" }, isInvoiceRefused: true })
	})

	test("recusado com a nota já recusada, cancelada, sem nota da recusa ou em outro recebimento: já recusado", () => {
		expect(() => planReceiptRefusal({ status: "rejected", nfe_document_id: NFE, source: "nfe" }, { status: "refused" }, REASON)).toThrow(
			"Recebimento já recusado"
		)
		expect(() => planReceiptRefusal({ status: "rejected", nfe_document_id: NFE, source: "nfe" }, { status: "cancelled" }, REASON)).toThrow(
			"Recebimento já recusado"
		)
		expect(() => planReceiptRefusal({ status: "rejected", nfe_document_id: NFE, source: "delivery_note" }, null, REASON)).toThrow("Recebimento já recusado")
		expect(() =>
			planReceiptRefusal(
				{ status: "rejected", nfe_document_id: NFE, source: "nfe" },
				{ status: "matched" },
				{ reason: undefined, isInvoiceInOtherReceipt: true }
			)
		).toThrow("A NF-e sustenta outro recebimento")
	})
})

describe("canCompleteInvoiceRefusal", () => {
	const base = { receiptStatus: "rejected", source: "nfe", invoice: { refused: false, cancelled: false }, isInvoiceInOtherReceipt: false }

	test("recusado com a nota da recusa ainda aceita: a tela oferece concluir", () => {
		expect(canCompleteInvoiceRefusal(base)).toBe(true)
	})

	test("nada a concluir: aberto, nota já recusada ou cancelada, nota semanal, nota em outro recebimento", () => {
		expect(canCompleteInvoiceRefusal({ ...base, receiptStatus: "provisional" })).toBe(false)
		expect(canCompleteInvoiceRefusal({ ...base, invoice: { refused: true, cancelled: false } })).toBe(false)
		expect(canCompleteInvoiceRefusal({ ...base, invoice: { refused: false, cancelled: true } })).toBe(false)
		expect(canCompleteInvoiceRefusal({ ...base, source: "delivery_note" })).toBe(false)
		expect(canCompleteInvoiceRefusal({ ...base, invoice: null })).toBe(false)
		expect(canCompleteInvoiceRefusal({ ...base, isInvoiceInOtherReceipt: true })).toBe(false)
	})
})

describe("resolveRefusalLostRace", () => {
	test("efetivado no meio: a nota marcada agora é desfeita, e a recusa responde que não vale mais", () => {
		expect(resolveRefusalLostRace("definitive", true)).toEqual({
			revertInvoice: true,
			message: "O recebimento mudou de estado (foi efetivado) enquanto a recusa era gravada e não pode mais ser recusado. A NF-e voltou à situação anterior.",
		})
		expect(resolveRefusalLostRace("divergent", false)).toEqual({
			revertInvoice: false,
			message: "O recebimento mudou de estado (foi efetivado) enquanto a recusa era gravada e não pode mais ser recusado.",
		})
	})

	test("recusado por outra decisão: a nota recusada combina com ele e fica", () => {
		expect(resolveRefusalLostRace("rejected", true)).toEqual({
			revertInvoice: false,
			message: "O recebimento foi recusado por outra decisão enquanto esta era gravada. Vale a recusa já registrada.",
		})
	})
})

describe("mensagens das escritas que falham", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())
	const transport = { code: "", message: "TypeError: fetch failed" }

	test("nota recusada e recebimento não: diz que ele continua aberto e como concluir", () => {
		expect(formatReceiptRefusalNotRecordedMessage(transport, true)).toBe(
			'A NF-e ficou marcada como recusada, mas o recebimento não (o banco não respondeu; tente de novo). Ele continua aberto: use "Concluir a recusa".'
		)
	})

	test("sem nota a marcar, é a falha simples da recusa", () => {
		expect(formatReceiptRefusalNotRecordedMessage(transport, false)).toBe("Erro ao recusar o recebimento: o banco não respondeu; tente de novo")
	})

	test("desfazer a marca falhou: diz que a nota ficou recusada e a quem avisar", () => {
		expect(formatInvoiceRevertFailedMessage(transport)).toContain("a NF-e ficou marcada como recusada (o banco não respondeu; tente de novo)")
	})
})
