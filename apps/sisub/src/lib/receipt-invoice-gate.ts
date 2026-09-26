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
 * @param invoice situação da NF-e do recebimento; `null` = recebimento sem nota (guia, avulso)
 * @param deferral motivo informado por quem efetiva com a SEFAZ indisponível
 */
export function decideReceiptInvoice(invoice: InvoiceSituation | null, deferral: { reason: string } | null, now: number = Date.now()): ReceiptInvoiceDecision {
	if (!invoice) return { kind: "ok" }
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
