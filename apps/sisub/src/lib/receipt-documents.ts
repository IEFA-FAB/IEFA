/**
 * Documentos do recebimento (`receiving.fn.ts`): o casamento das linhas com a NF-e no vínculo
 * posterior (`linkReceiptDocumentsFn`) e o que a tela mostra da nota, da OF e do empenho ligados
 * (`fetchReceiptContextFn`).
 *
 * Nada aqui lê nem grava. Fica fora de `receiving.fn.ts` porque teste unitário não importa
 * `@/server/*`.
 */

import { matchReceiptLinesToInvoice, receiptLinkWarnings } from "@iefa/sisub-domain/operations"
import { invoiceSituationProblem } from "@/lib/invoice-gate"
import { isInvoiceCancelled } from "@/lib/receipt-invoice-gate"

// ── Vínculo posterior (`linkReceiptDocumentsFn`) ───────────────────────────

/**
 * Trocando de nota: o custo que veio da nota antiga sai no banco e a nova o repõe onde
 * casar — então, para o casamento, ele não existe. O item da nota antiga também não.
 */
export function isSwitchingNfe(requestedNfeId: string | null | undefined, currentNfeId: string | null): boolean {
	return requestedNfeId != null && currentNfeId != null && requestedNfeId !== currentNfeId
}

export interface LinkReceiptLine {
	id: string
	item_id: string | null
	purchase_item_id: string | null
	nfe_item_id: string | null
	unit_cost: number | null
	unit_cost_source: string | null
}

export interface LinkInvoiceItem {
	id: string
	n_item: number | null
	description: string | null
	item_id: string | null
	purchase_item_id: string | null
	matched_qty_base: number | null
	unit_price: number | null
	commercial_qty: number | null
}

function toNumber(value: unknown): number | null {
	return value == null ? null : Number(value)
}

export interface InvoiceLinkPlan {
	links: Array<{ receipt_item_id: string; nfe_item_id: string }>
	costs: Array<{ receipt_item_id: string; unit_cost: number }>
	/** Insumos das linhas que a nota não cobre, para dizer quais são. */
	unmatchedIngredientIds: string[]
}

/** O que o vínculo grava: linha → item da nota e, com o recebimento aberto, o custo da linha. */
export function planInvoiceLink(input: {
	lines: readonly LinkReceiptLine[]
	invoiceItems: readonly LinkInvoiceItem[]
	switchingNfe: boolean
	/** Recebimento já efetivado: o custo já está no estoque e não muda. */
	attested: boolean
}): InvoiceLinkPlan {
	const { switchingNfe } = input
	const match = matchReceiptLinesToInvoice(
		input.lines.map((line) => ({
			id: String(line.id),
			ingredientId: line.item_id ?? null,
			purchaseItemId: line.purchase_item_id ?? null,
			nfeItemId: switchingNfe ? null : (line.nfe_item_id ?? null),
			unitCost: switchingNfe && line.unit_cost_source === "invoice_link" ? null : toNumber(line.unit_cost),
		})),
		input.invoiceItems.map((item) => ({
			id: String(item.id),
			nItem: toNumber(item.n_item),
			description: item.description ?? null,
			ingredientId: item.item_id ?? null,
			purchaseItemId: item.purchase_item_id ?? null,
			matchedQtyBase: toNumber(item.matched_qty_base),
			unitPrice: toNumber(item.unit_price),
			commercialQty: toNumber(item.commercial_qty),
		}))
	)
	const unmatchedIds = new Set(match.unmatchedLineIds)
	return {
		links: match.links.map((link) => ({ receipt_item_id: link.receiptItemId, nfe_item_id: link.nfeItemId })),
		// efetivado: o custo já está no estoque e não muda
		costs: input.attested ? [] : match.costs.map((cost) => ({ receipt_item_id: cost.receiptItemId, unit_cost: cost.unitCost })),
		unmatchedIngredientIds: input.lines.filter((line) => unmatchedIds.has(String(line.id)) && line.item_id).map((line) => String(line.item_id)),
	}
}

/** Avisos do vínculo: fornecedor da entrega, do empenho e da nota que não batem, nota sem itens. */
export function collectInvoiceLinkWarnings(input: {
	receiptSupplierDocument: string | null | undefined
	empenhoSupplierCnpj: string | null
	invoice: { supplier_cnpj: string | null; supplier_cpf: string | null }
	invoiceItemCount: number
	attested: boolean
}): string[] {
	return receiptLinkWarnings({
		receiptSupplierDocument: input.receiptSupplierDocument ?? null,
		empenhoSupplierCnpj: input.empenhoSupplierCnpj,
		invoiceSupplierDocument: input.invoice.supplier_cnpj ?? input.invoice.supplier_cpf ?? null,
		invoiceHasItems: input.invoiceItemCount > 0,
		attested: input.attested,
	})
}

/** Contagens que `link_receipt_documents` devolve; sem linha, zero. */
export function getLinkResultCounts(result: ReadonlyArray<{ linked_items: number | null; costed_items: number | null }> | null) {
	const row = (result ?? [])[0]
	return {
		linkedItems: Number(row?.linked_items ?? 0),
		costedItems: Number(row?.costed_items ?? 0),
	}
}

// ── Contexto do recebimento (`fetchReceiptContextFn`) ──────────────────────

export function formatSupplyOrderLabel(number: string | null): string {
	return number ? `OF ${number}` : "OF sem número"
}

export interface ContextInvoiceRow {
	access_key: string
	supplier_name: string | null
	status: string
	situation_result: string | null
	situation_checked_at: string | null
}

/** A nota do recebimento como a tela a mostra: o problema para efetivar, se está cancelada e o rótulo. */
export function buildReceiptContextInvoice(note: ContextInvoiceRow | null) {
	if (!note) return null
	const invoice = { status: String(note.status), situationResult: note.situation_result ?? null, situationCheckedAt: note.situation_checked_at ?? null }
	return {
		problem: invoiceSituationProblem(invoice),
		cancelled: isInvoiceCancelled(invoice),
		label: `NF-e ${String(note.access_key).slice(25, 34)}${note.supplier_name ? ` · ${note.supplier_name}` : ""}`,
	}
}

export function buildReceiptContextSupplyOrder(order: { number: string | null; empenho_id: string | null } | null, supplyOrderId: string | null) {
	if (!order) return null
	return {
		id: String(supplyOrderId),
		label: formatSupplyOrderLabel(order.number),
		// a NE desta entrega se vincula na OF (SICAF), e o recebimento a acompanha
		awaitingEmpenho: order.empenho_id == null,
	}
}

export function buildReceiptContextEmpenho(empenho: { numero_empenho: string | null; favorecido_nome: string | null } | null) {
	return empenho ? { label: `${empenho.numero_empenho}${empenho.favorecido_nome ? ` · ${empenho.favorecido_nome}` : ""}` } : null
}
