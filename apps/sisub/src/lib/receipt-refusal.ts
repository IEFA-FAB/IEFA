/**
 * Recusa do recebimento inteiro (`refuseReceiptFn`): o que gravar, e o que dizer quando a
 * segunda escrita falha.
 *
 * São duas escritas sem transação: o recebimento vira `rejected` e, se ele nasceu DA nota, a NF-e
 * vira `refused`. Se a segunda falha, o recebimento já está recusado e a nota não. Antes o erro
 * da nota era descartado e a tela dizia "recusado" com a NF-e ainda aceita. Agora a falha volta
 * com instrução, e recusar de novo um recebimento já recusado só conclui a marca da nota.
 */

import { isReceiptEditable } from "@iefa/sisub-domain/operations"
import { type DbErrorLike, publicDbMessage } from "@/lib/db-error-message"

export type ReceiptRefusalPlan = {
	/** Grava `rejected` no recebimento (falso quando ele já está recusado: é a repetição). */
	updateReceipt: boolean
	/** Marca a NF-e como `refused`: só a do recebimento criado DELA. */
	markInvoiceRefused: boolean
}

type RefusableReceipt = { status: string; nfe_document_id: string | null; source: string | null }

/**
 * Plano da recusa. A NF-e semanal vinculada à entrega de um dia cobre as outras entregas da
 * semana, que foram aceitas: só a nota do recebimento criado dela vira recusada.
 */
export function planReceiptRefusal(receipt: RefusableReceipt): ReceiptRefusalPlan {
	const markInvoiceRefused = receipt.nfe_document_id != null && receipt.source === "nfe"
	// Repetição depois de a marca da nota falhar: o recebimento fica como está e a nota é marcada.
	if (receipt.status === "rejected") return { updateReceipt: false, markInvoiceRefused }
	if (!isReceiptEditable(receipt.status)) throw new Error("Recebimento já efetivado")
	return { updateReceipt: true, markInvoiceRefused }
}

/** O recebimento ficou recusado e a NF-e não: diz o que houve e como concluir. */
export function formatInvoiceRefusalNotRecordedMessage(error: DbErrorLike): string {
	return `O recebimento foi recusado, mas a NF-e não ficou marcada como recusada (${publicDbMessage(error)}). Recuse de novo para concluir.`
}
