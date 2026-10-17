/**
 * A nota na EFETIVAÇÃO do estoque, com a SEFAZ fora do ar (change
 * `sisub-flexible-expense-execution`, D5/D8).
 *
 * A regra da nota continua uma só (`invoiceSituationProblem`, em `invoice-gate.ts`). O que
 * muda aqui é o que a efetivação faz com o problema: a carne está na porta e o portal da
 * SEFAZ não responde — travar a entrada faria o almoxarife guardar a carne "por fora" e
 * lançar depois, que é o controle paralelo. Então o estoque entra, com a consulta pendente
 * registrada (quem, quando, por quê), e a LIQUIDAÇÃO continua exigindo a consulta recente:
 * pagar é o ato que a nota comprova (Lei 4.320, art. 63), e ele não se afrouxa.
 *
 * O que nunca se adia: nota que a SEFAZ JÁ disse cancelada. Aí não é indisponibilidade, é
 * documento inválido.
 */

import { type InvoiceSituation, invoiceSituationProblem } from "./invoice-gate"

/** Motivo mínimo para registrar a efetivação com a consulta pendente. */
export const DEFERRAL_REASON_MIN_LENGTH = 10

export type ReceiptInvoiceDecision =
	| { kind: "ok" }
	/** Efetiva e registra a consulta pendente. */
	| { kind: "defer"; problem: string }
	| { kind: "refuse"; message: string }

export function isInvoiceCancelled(invoice: Pick<InvoiceSituation, "status" | "situationResult">): boolean {
	return invoice.status === "cancelled" || invoice.situationResult === "cancelled"
}

/**
 * NF-e recusada no sistema (`refused`). A recusa do recebimento inteiro marca a nota ANTES do
 * recebimento (`receipt-refusal.ts`): se a segunda escrita falha, o recebimento fica aberto com a
 * nota já recusada. Efetivar daí poria no estoque a entrega cuja nota a própria unidade recusou.
 * É recusa por coerência documental, não trava por falta de dado: o caminho é concluir a recusa.
 */
export function isInvoiceRefused(invoice: Pick<InvoiceSituation, "status">): boolean {
	return invoice.status === "refused"
}

export const REFUSED_INVOICE_MESSAGE = "A NF-e deste recebimento foi recusada. Conclua a recusa do recebimento ou peça a reabertura da NF-e"

/**
 * @param invoice situação da NF-e do recebimento; `null` = recebimento sem nota (guia, avulso)
 * @param deferral motivo informado por quem efetiva com a SEFAZ indisponível
 */
export function decideReceiptInvoice(invoice: InvoiceSituation | null, deferral: { reason: string } | null, now: number = Date.now()): ReceiptInvoiceDecision {
	if (!invoice) return { kind: "ok" }
	// Antes da consulta da SEFAZ e sem adiamento possível: a recusa é da própria unidade.
	if (isInvoiceRefused(invoice)) return { kind: "refuse", message: REFUSED_INVOICE_MESSAGE }
	const problem = invoiceSituationProblem(invoice, now)
	if (!problem) return { kind: "ok" }
	if (isInvoiceCancelled(invoice)) return { kind: "refuse", message: problem }
	const reason = deferral?.reason.trim() ?? ""
	if (reason.length >= DEFERRAL_REASON_MIN_LENGTH) return { kind: "defer", problem }
	return {
		kind: "refuse",
		message: deferral
			? `Diga por que a consulta não pôde ser feita (ao menos ${DEFERRAL_REASON_MIN_LENGTH} caracteres) para efetivar com ela pendente`
			: `${problem}. Se a SEFAZ está fora do ar, efetive com a consulta pendente: o estoque entra agora e a liquidação continua exigindo a consulta recente.`,
	}
}
