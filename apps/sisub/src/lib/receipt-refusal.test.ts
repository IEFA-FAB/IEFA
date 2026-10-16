import { afterEach, describe, expect, test, vi } from "vitest"
import { formatReceiptRefusalNotRecordedMessage, planReceiptRefusal } from "./receipt-refusal"

const NFE = "00000000-0000-4000-8000-000000000001"

describe("planReceiptRefusal", () => {
	test("recebimento aberto criado da nota: a NF-e é marcada (antes do recebimento)", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "nfe" })).toEqual({ invoiceToRefuse: NFE })
		expect(planReceiptRefusal({ status: "provisional", nfe_document_id: NFE, source: "nfe" })).toEqual({ invoiceToRefuse: NFE })
	})

	test("NF-e semanal vinculada à entrega do dia não vira recusada", () => {
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: NFE, source: "delivery_note" })).toEqual({ invoiceToRefuse: null })
		expect(planReceiptRefusal({ status: "draft", nfe_document_id: null, source: "nfe" })).toEqual({ invoiceToRefuse: null })
	})

	test("efetivado ou já recusado não se recusa", () => {
		expect(() => planReceiptRefusal({ status: "definitive", nfe_document_id: NFE, source: "nfe" })).toThrow("Recebimento já efetivado")
		expect(() => planReceiptRefusal({ status: "divergent", nfe_document_id: null, source: "delivery_note" })).toThrow("Recebimento já efetivado")
		expect(() => planReceiptRefusal({ status: "rejected", nfe_document_id: NFE, source: "nfe" })).toThrow("Recebimento já recusado")
	})

	test("estado parcial (nota recusada, recebimento aberto): repetir a recusa refaz o mesmo plano", () => {
		// A NF-e já `refused` não muda o plano: o recebimento ainda editável marca de novo (idempotente)
		// e recusa. Era o caminho que faltava quando o recebimento ficava recusado com a nota aceita.
		expect(planReceiptRefusal({ status: "provisional", nfe_document_id: NFE, source: "nfe" })).toEqual({ invoiceToRefuse: NFE })
	})
})

describe("formatReceiptRefusalNotRecordedMessage", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())
	const transport = { code: "", message: "TypeError: fetch failed" }

	test("nota recusada e recebimento não: diz que ele continua aberto e como concluir", () => {
		expect(formatReceiptRefusalNotRecordedMessage(transport, true)).toBe(
			"A NF-e ficou marcada como recusada, mas o recebimento não (o banco não respondeu; tente de novo). Ele continua aberto: recuse de novo para concluir."
		)
	})

	test("sem nota a marcar, é a falha simples da recusa", () => {
		expect(formatReceiptRefusalNotRecordedMessage(transport, false)).toBe("Erro ao recusar o recebimento: o banco não respondeu; tente de novo")
	})
})
