import {
	DESIGNATION_SCREEN_LABEL,
	RECEIPT_PENDING_SEVERITY,
	type ReceiptPendingKind,
	type ReceiptPendingRow,
	type ReceivingPendingStatus,
} from "@iefa/sisub-domain"
import type { FlowIssue, IssueSeverity } from "./model"
import { formatShortDate, pluralize } from "./model"

/**
 * Pendências do recebimento no painel "a caminho" do Estoque (change
 * `sisub-flexible-expense-execution`, D9). Uma linha por recebimento, com tudo o que falta
 * nele e a ação que resolve: é o almoxarife quem vincula a nota, a OF e o empenho.
 */

/** O que falta, em poucas palavras, para compor a frase do recebimento. */
export function describeReceiptPending(
	kind: ReceiptPendingKind,
	row: Pick<ReceiptPendingRow, "linesWithoutCost" | "linesWithoutInvoiceItem">,
	canDesignate: boolean
): string {
	switch (kind) {
		case "nfe_cancelled":
			return "NF-e cancelada na SEFAZ depois da efetivação: não liquide, peça a nota substituta ao fornecedor"
		case "conference_without_inspector":
			return canDesignate
				? "conferência registrada e ninguém é fiscal designado para confirmar o provisório: designe no recebimento"
				: `conferência registrada e ninguém é fiscal designado para confirmar o provisório: peça a designação ao chefe do rancho (${DESIGNATION_SCREEN_LABEL})`
		case "provisional_without_manager":
			return "provisório feito, sem gestor nem comissão designada para o definitivo (Lei 14.133/2021, art. 140, II, b)"
		case "without_invoice":
			return "sem NF-e: vincule a nota quando ela chegar"
		case "without_empenho":
			return "sem empenho: vincule a NE (Lei 4.320/1964, art. 60)"
		case "without_supply_order":
			return "sem OF"
		case "invoice_check_pending":
			return "efetivado com a SEFAZ fora do ar: consulte a situação da NF-e, que a liquidação exige"
		case "lines_without_cost":
			return `${pluralize(row.linesWithoutCost, "linha efetivada sem custo", "linhas efetivadas sem custo")}: o estoque está valorado a menor`
		case "lines_without_invoice_item":
			return `${pluralize(row.linesWithoutInvoiceItem, "linha sem item da NF-e casado", "linhas sem item da NF-e casado")}: refaça o vínculo quando o XML chegar`
	}
}

const SEVERITY_ORDER: IssueSeverity[] = ["blocking", "warning", "info"]

/** A pior gravidade entre as pendências do recebimento. */
export function worstSeverity(kinds: readonly ReceiptPendingKind[]): IssueSeverity {
	for (const severity of SEVERITY_ORDER) if (kinds.some((kind) => RECEIPT_PENDING_SEVERITY[kind] === severity)) return severity
	return "info"
}

export function buildReceivingPendingIssues(status: ReceivingPendingStatus): FlowIssue[] {
	const issues = status.receipts.map((row) => {
		const who = row.supplierName ? ` (${row.supplierName})` : ""
		const when = formatShortDate(row.createdAt)
		const what = row.pending.map((kind) => describeReceiptPending(kind, row, status.canDesignate)).join("; ")
		return {
			severity: worstSeverity(row.pending),
			message: `${row.reference}${who}, ${when}: ${what}.`,
			action: { label: "Abrir recebimento", href: `/storage/${status.kitchenId}/receiving/${row.receiptId}` },
		} satisfies FlowIssue
	})
	return issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}
