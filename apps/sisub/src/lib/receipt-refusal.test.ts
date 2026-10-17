import { afterEach, describe, expect, test, vi } from "vitest"
import {
	formatInvoiceRecheckFailedMessage,
	formatInvoiceRevertOutcome,
	formatReceiptRefusalNotRecordedMessage,
	INVOICE_TAKEN_BY_OTHER_RECEIPT_MESSAGE,
	isInvoiceRefusalCompletable,
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

describe("isInvoiceRefusalCompletable", () => {
	const base = { receiptStatus: "rejected", source: "nfe", invoice: { refused: false, cancelled: false }, isInvoiceInOtherReceipt: false }

	test("recusado com a nota da recusa ainda aceita: a tela oferece concluir", () => {
		expect(isInvoiceRefusalCompletable(base)).toBe(true)
	})

	test("nada a concluir: aberto, nota já recusada ou cancelada, nota semanal, nota em outro recebimento", () => {
		expect(isInvoiceRefusalCompletable({ ...base, receiptStatus: "provisional" })).toBe(false)
		expect(isInvoiceRefusalCompletable({ ...base, invoice: { refused: true, cancelled: false } })).toBe(false)
		expect(isInvoiceRefusalCompletable({ ...base, invoice: { refused: false, cancelled: true } })).toBe(false)
		expect(isInvoiceRefusalCompletable({ ...base, source: "delivery_note" })).toBe(false)
		expect(isInvoiceRefusalCompletable({ ...base, invoice: null })).toBe(false)
		expect(isInvoiceRefusalCompletable({ ...base, isInvoiceInOtherReceipt: true })).toBe(false)
	})
})

describe("resolveRefusalLostRace", () => {
	test("efetivado no meio: a nota marcada agora é desfeita, e a recusa responde que não vale mais", () => {
		const effective = "O recebimento foi efetivado enquanto a recusa era gravada e não pode mais ser recusado."
		expect(resolveRefusalLostRace("definitive", true)).toEqual({ revertInvoice: true, message: effective })
		expect(resolveRefusalLostRace("divergent", false)).toEqual({ revertInvoice: false, message: effective })
	})

	test("recusado por outra decisão: a nota recusada combina com ele e fica", () => {
		expect(resolveRefusalLostRace("rejected", true)).toEqual({
			revertInvoice: false,
			message: "O recebimento foi recusado por outra decisão enquanto esta era gravada. Vale a recusa já registrada.",
		})
	})

	test("recebimento ausente não é 'foi efetivado': a recusa não foi registrada e a marca se desfaz", () => {
		expect(resolveRefusalLostRace(null, true)).toEqual({
			revertInvoice: true,
			message: "O recebimento não foi encontrado (foi apagado enquanto a recusa era gravada): a recusa não foi registrada.",
		})
	})

	test("outro estado: diz qual, sem afirmar efetivação", () => {
		const race = resolveRefusalLostRace("provisional", true)
		expect(race.revertInvoice).toBe(true)
		expect(race.message).toBe(
			"O recebimento mudou de estado (provisório) enquanto a recusa era gravada e ela não foi registrada. Recarregue e confira antes de recusar de novo."
		)
		expect(race.message).not.toContain("efetivado")
	})
})

describe("formatInvoiceRevertOutcome", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())
	const base = "O recebimento foi efetivado enquanto a recusa era gravada e não pode mais ser recusado."

	test("diz o que de fato aconteceu com a nota", () => {
		expect(formatInvoiceRevertOutcome(base, { kind: "none" })).toBe(base)
		expect(formatInvoiceRevertOutcome(base, { kind: "reverted" })).toBe(`${base} A NF-e voltou à situação anterior.`)
	})

	test("revert sem linha: não afirma que a nota voltou", () => {
		const message = formatInvoiceRevertOutcome(base, { kind: "already_changed" })
		expect(message).toContain("A NF-e não voltou à situação anterior")
		expect(message).not.toContain("A NF-e voltou")
	})

	test("revert que falhou: a nota ficou recusada, e a quem avisar", () => {
		expect(formatInvoiceRevertOutcome(base, { kind: "failed", error: { code: "", message: "TypeError: fetch failed" } })).toContain(
			"A NF-e ficou marcada como recusada (o banco não respondeu; tente de novo): avise a gestão do estoque"
		)
	})

	test("entrega nova usando a nota durante a conclusão: a marca é desfeita e isso é dito", () => {
		expect(formatInvoiceRevertOutcome(INVOICE_TAKEN_BY_OTHER_RECEIPT_MESSAGE, { kind: "reverted" })).toBe(
			"Uma entrega nova passou a usar esta NF-e enquanto a recusa era concluída: a nota não fica recusada. A NF-e voltou à situação anterior."
		)
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

	test("a conferência depois da marca falhou: a nota ficou recusada e é preciso conferir", () => {
		expect(formatInvoiceRecheckFailedMessage(transport)).toBe(
			"A NF-e foi marcada como recusada, mas não deu para conferir se outra entrega a usa (o banco não respondeu; tente de novo). Recarregue e confira os recebimentos da nota."
		)
	})
})
