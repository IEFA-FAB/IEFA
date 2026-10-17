/**
 * Recusa do recebimento inteiro (`refuseReceiptFn`): o que gravar, em que ordem, e o que dizer
 * quando só uma das escritas vale.
 *
 * São duas escritas sem transação (a atômica pede função SQL): a NF-e do recebimento criado dela
 * vira `refused` e o recebimento vira `rejected`. A ordem é essa de propósito. Com a nota
 * primeiro, o estado parcial é nota recusada e recebimento ainda aberto: a tela continua
 * oferecendo "Concluir a recusa", e repetir conclui.
 *
 * Recebimentos recusados antes desta ordem (o recebimento primeiro) podem ter ficado recusados com
 * a nota aceita. Recusar de novo um recebimento `rejected` só completa a marca da nota; a tela
 * mostra "Concluir a recusa da NF-e" nesse caso.
 *
 * As duas escritas são condicionais: a nota só passa a `refused` a partir da situação lida, e o
 * recebimento só a `rejected` enquanto aberto. Sem a condição, uma efetivação que terminasse no
 * meio virava `rejected` com o estoque já lançado.
 */

import { isReceiptEditable } from "@iefa/sisub-domain/operations"
import { type DbErrorLike, publicDbMessage } from "@/lib/db-error-message"

type RefusableReceipt = { status: string; nfe_document_id: string | null; source: string | null }

/** Motivo mínimo da recusa (vai no termo). */
export const REFUSAL_REASON_MIN_LENGTH = 5

/** Situações em que a nota já está decidida e a recusa não a reescreve. */
const SETTLED_INVOICE_STATUSES = ["refused", "cancelled"]

export type ReceiptRefusalPlan = {
	/** `false`: o recebimento já está recusado e só falta a marca da NF-e. */
	rejectReceipt: boolean
	/** NF-e a marcar como recusada, com a situação lida (a escrita é condicional a ela). */
	invoiceToRefuse: { id: string; previousStatus: string } | null
	/** A nota fica recusada depois da primeira escrita (para a mensagem do estado parcial). */
	isInvoiceRefused: boolean
}

/**
 * O que gravar. Só a nota do recebimento criado DELA vira recusada: a NF-e semanal vinculada à
 * entrega de um dia cobre as outras entregas da semana, que foram aceitas.
 *
 * @param invoice situação atual da NF-e do recebimento (nula sem nota, ou quando ela não é da recusa)
 * @param isInvoiceInOtherReceipt a nota sustenta outro recebimento não recusado (lido só para o
 *   recebimento já recusado: a nota reaproveitada numa entrega nova não se marca)
 */
export function planReceiptRefusal(
	receipt: RefusableReceipt,
	invoice: { status: string } | null,
	options: { reason: string | undefined; isInvoiceInOtherReceipt: boolean }
): ReceiptRefusalPlan {
	const invoiceId = receipt.source === "nfe" ? receipt.nfe_document_id : null
	const invoiceStatus = invoiceId && invoice ? invoice.status : null
	const isInvoiceMarkable = invoiceStatus != null && !SETTLED_INVOICE_STATUSES.includes(invoiceStatus)
	const invoiceToRefuse = invoiceId && invoiceStatus && isInvoiceMarkable ? { id: invoiceId, previousStatus: invoiceStatus } : null

	if (receipt.status === "rejected") {
		if (!invoiceToRefuse) throw new Error("Recebimento já recusado")
		if (options.isInvoiceInOtherReceipt) throw new Error("Recebimento já recusado. A NF-e sustenta outro recebimento e não é marcada como recusada")
		return { rejectReceipt: false, invoiceToRefuse, isInvoiceRefused: true }
	}
	if (!isReceiptEditable(receipt.status)) throw new Error("Recebimento já efetivado")
	if ((options.reason?.trim().length ?? 0) < REFUSAL_REASON_MIN_LENGTH) {
		throw new Error(`Informe o motivo da recusa (ao menos ${REFUSAL_REASON_MIN_LENGTH} caracteres)`)
	}
	return { rejectReceipt: true, invoiceToRefuse, isInvoiceRefused: invoiceToRefuse != null || invoiceStatus === "refused" }
}

/**
 * Recebimento recusado com a NF-e da qual ele foi criado ainda aceita (a ordem antiga das
 * escritas): a tela oferece "Concluir a recusa da NF-e". A nota que já sustenta outro recebimento
 * (entrega nova com a mesma nota) não se marca.
 */
export function canCompleteInvoiceRefusal(input: {
	receiptStatus: string
	source: string | null
	invoice: { refused: boolean; cancelled: boolean } | null
	isInvoiceInOtherReceipt: boolean
}): boolean {
	return (
		input.receiptStatus === "rejected" &&
		input.source === "nfe" &&
		input.invoice != null &&
		!input.invoice.refused &&
		!input.invoice.cancelled &&
		!input.isInvoiceInOtherReceipt
	)
}

/** A NF-e ficou recusada e o recebimento não: diz o que houve e como concluir pela tela. */
export function formatReceiptRefusalNotRecordedMessage(error: DbErrorLike, isInvoiceRefused: boolean): string {
	const reason = publicDbMessage(error)
	if (!isInvoiceRefused) return `Erro ao recusar o recebimento: ${reason}`
	return `A NF-e ficou marcada como recusada, mas o recebimento não (${reason}). Ele continua aberto: use "Concluir a recusa".`
}

/**
 * A recusa do recebimento não pegou linha nenhuma: ele saiu de rascunho/provisório entre a leitura
 * e a escrita. Recusado por outra decisão, a nota marcada combina com ele e fica. Efetivado, a
 * entrega está no estoque: a nota marcada agora é desfeita, porque nota recusada com estoque
 * lançado não tem caminho na tela para voltar.
 *
 * @param currentStatus situação relida do recebimento (nula se a releitura falhou)
 * @param isInvoiceMarkedNow esta chamada marcou a nota (a que já estava recusada não se desfaz)
 */
export function resolveRefusalLostRace(currentStatus: string | null, isInvoiceMarkedNow: boolean): { revertInvoice: boolean; message: string } {
	if (currentStatus === "rejected") {
		return { revertInvoice: false, message: "O recebimento foi recusado por outra decisão enquanto esta era gravada. Vale a recusa já registrada." }
	}
	const prefix = "O recebimento mudou de estado (foi efetivado) enquanto a recusa era gravada e não pode mais ser recusado."
	return { revertInvoice: isInvoiceMarkedNow, message: isInvoiceMarkedNow ? `${prefix} A NF-e voltou à situação anterior.` : prefix }
}

/** Desfazer a marca da nota falhou: ela ficou recusada com a entrega efetivada. */
export function formatInvoiceRevertFailedMessage(error: DbErrorLike): string {
	return `O recebimento foi efetivado enquanto a recusa era gravada e não pode mais ser recusado, mas a NF-e ficou marcada como recusada (${publicDbMessage(error)}). Avise a gestão do estoque: a nota precisa voltar à situação anterior.`
}
