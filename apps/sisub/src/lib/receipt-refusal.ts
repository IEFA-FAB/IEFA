/**
 * Recusa do recebimento inteiro (`refuseReceiptFn`): o que gravar, em que ordem, e o que dizer
 * quando só a primeira escrita vale.
 *
 * São duas escritas sem transação (a atômica pede função SQL): a NF-e do recebimento criado dela
 * vira `refused` e o recebimento vira `rejected`. A ordem é essa de propósito. Recebimento
 * recusado sai da tela de decisão (o botão "Recusar" só existe no editável); com ele recusado e a
 * nota aceita, não havia caminho para concluir. Com a nota primeiro, o estado parcial é nota
 * recusada e recebimento ainda aberto: a tela continua oferecendo "Recusar", e repetir é
 * idempotente (marcar recusada uma nota já recusada não falha).
 */

import { isReceiptEditable } from "@iefa/sisub-domain/operations"
import { type DbErrorLike, publicDbMessage } from "@/lib/db-error-message"

type RefusableReceipt = { status: string; nfe_document_id: string | null; source: string | null }

/**
 * NF-e a marcar como recusada antes de recusar o recebimento, ou nulo. A NF-e semanal vinculada à
 * entrega de um dia cobre as outras entregas da semana, que foram aceitas: só a nota do
 * recebimento criado DELA vira recusada.
 */
export function planReceiptRefusal(receipt: RefusableReceipt): { invoiceToRefuse: string | null } {
	if (receipt.status === "rejected") throw new Error("Recebimento já recusado")
	if (!isReceiptEditable(receipt.status)) throw new Error("Recebimento já efetivado")
	return { invoiceToRefuse: receipt.source === "nfe" ? receipt.nfe_document_id : null }
}

/** A NF-e ficou recusada e o recebimento não: diz o que houve e como concluir pela tela. */
export function formatReceiptRefusalNotRecordedMessage(error: DbErrorLike, isInvoiceRefused: boolean): string {
	const reason = publicDbMessage(error)
	if (!isInvoiceRefused) return `Erro ao recusar o recebimento: ${reason}`
	return `A NF-e ficou marcada como recusada, mas o recebimento não (${reason}). Ele continua aberto: recuse de novo para concluir.`
}
