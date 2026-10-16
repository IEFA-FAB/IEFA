import { afterEach, describe, expect, test, vi } from "vitest"
import { formatInvoiceRefusalNotRecordedMessage, planReceiptRefusal } from "./receipt-refusal"

const NFE = "00000000-0000-4000-8000-000000000001"

describe("planReceiptRefusal", () => {
	test("recebimento aberto criado da nota: recusa e marca a NF-e", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "nfe" })).toEqual({ updateReceipt: true, markInvoiceRefused: true })
		expect(planReceiptRefusal({ status: "provisional", nfe_document_id: NFE, source: "nfe" })).toEqual({ updateReceipt: true, markInvoiceRefused: true })
	})

	test("NF-e semanal vinculada à entrega do dia não vira recusada", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "delivery_note" })).toEqual({ updateReceipt: true, markInvoiceRefused: false })
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: null, source: "nfe" })).toEqual({ updateReceipt: true, markInvoiceRefused: false })
	})

	test("efetivado não se recusa", () => {
		expect(() => planReceiptRefusal({ status: "definitive", nfe_document_id: NFE, source: "nfe" })).toThrow("Recebimento já efetivado")
		expect(() => planReceiptRefusal({ status: "divergent", nfe_document_id: null, source: "delivery_note" })).toThrow("Recebimento já efetivado")
	})

	test("recusar de novo depois de a marca da nota falhar só conclui a nota", () => {
		// Antes, o recebimento já recusado caía em "Recebimento já efetivado" e a NF-e ficava aceita.
		expect(planReceiptRefusal({ status: "rejected", nfe_document_id: NFE, source: "nfe" })).toEqual({ updateReceipt: false, markInvoiceRefused: true })
		expect(planReceiptRefusal({ status: "rejected", nfe_document_id: null, source: "delivery_note" })).toEqual({
			updateReceipt: false,
			markInvoiceRefused: false,
		})
	})
})

describe("formatInvoiceRefusalNotRecordedMessage", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())

	test("diz que o recebimento ficou recusado, que a nota não, e como concluir", () => {
		const message = formatInvoiceRefusalNotRecordedMessage({ code: "", message: "TypeError: fetch failed" })
		expect(message).toBe(
			"O recebimento foi recusado, mas a NF-e não ficou marcada como recusada (o banco não respondeu; tente de novo). Recuse de novo para concluir."
		)
	})
})
