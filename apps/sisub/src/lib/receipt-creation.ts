/**
 * Criação do recebimento (`receiving.fn.ts`): pela NF-e e sem ela (guia de remessa, avulso).
 * As recusas, as linhas que vão ao banco e os avisos por linha.
 *
 * Nada aqui lê nem grava: a fn lê, decide com estas funções e escreve, na mesma ordem de
 * antes. Fica fora de `receiving.fn.ts` porque teste unitário não importa `@/server/*`.
 */

import { normalizeSupplierDocument, receiptWithoutInvoiceProblems, unitCostFromNfe } from "@iefa/sisub-domain/operations"
import { type DbErrorLike, publicDbMessage } from "@/lib/db-error-message"
import { itemDescription } from "@/lib/item-description"

/** `Number(...)` de coluna nulável, mantendo o nulo. */
export function nullableNumber(value: number | string | null | undefined): number | null {
	return value != null ? Number(value) : null
}

// ── OF e empenho que sustentam a entrega ───────────────────────────────────

export type Decision<T> = { ok: true; value: T } | { ok: false; problem: string }

/**
 * A OF sustenta a entrega? Tem de ser desta cozinha e enviada, e o empenho pedido tem de ser o
 * dela. Devolve o empenho que vale (o da OF, quando ela tem).
 */
export function empenhoFromOrder(
	order: { kitchen_id: number | string | null; empenho_id: string | null; status: string } | null,
	kitchenId: number,
	requestedEmpenhoId: string | null
): Decision<string | null> {
	if (!order || Number(order.kitchen_id) !== kitchenId) return { ok: false, problem: "OF não encontrada ou de outra cozinha" }
	if (order.status === "draft" || order.status === "cancelled")
		return { ok: false, problem: "Só OF enviada sustenta a entrega — envie a OF ou registre sem ela" }
	if (order.empenho_id) {
		if (requestedEmpenhoId && requestedEmpenhoId !== order.empenho_id) {
			return { ok: false, problem: "A OF é de outro empenho — escolha o empenho da OF, ou registre sem OF" }
		}
		return { ok: true, value: order.empenho_id }
	}
	if (requestedEmpenhoId) {
		// a mesma regra de `link_receipt_documents`: a NE da OF aguardando empenho entra NA OF (SICAF)
		return {
			ok: false,
			problem: "A OF está aguardando empenho: vincule a NE na própria OF, que confere o SICAF — ou registre a entrega com a OF e sem NE",
		}
	}
	return { ok: true, value: requestedEmpenhoId }
}

/** O empenho é da unidade compradora e não está anulado? */
export function usableEmpenho<E extends { unit_id: number | string | null; status: string }>(row: E | null, unitId: number | null): Decision<E> {
	if (!row || unitId == null || Number(row.unit_id) !== unitId) return { ok: false, problem: "Empenho não encontrado nesta unidade" }
	if (row.status === "anulado") return { ok: false, problem: "Empenho anulado não sustenta entrega — registre sem empenho e vincule a NE vigente depois" }
	return { ok: true, value: row }
}

// ── Recebimento a partir da NF-e ───────────────────────────────────────────

/** Nota que já fecha entregas recebidas sem ela não gera recebimento próprio. */
export function linkedDeliveriesProblem(linkedDeliveries: number | null): string | null {
	const isLinked = (linkedDeliveries ?? 0) > 0
	if (!isLinked) return null
	return `Esta NF-e já está vinculada a ${linkedDeliveries} entrega(s) recebida(s) sem nota — não crie outro recebimento: confira os itens nas entregas vinculadas`
}

interface NfeItemForReceiving {
	id: string
	n_item: number | null
	description: string | null
	ingredient_id: string | null
}

/**
 * A nota só vira recebimento com TODAS as linhas casadas a um insumo. Linha sem insumo resolvido
 * SUMIA do recebimento (ia como `skipped`): o conferente recebia uma nota de 6 linhas com 5 na
 * tela e nada dizia que a sexta existia. Enquanto a linha não casada não tem onde morar no
 * recebimento (goods_receipt_item exige ingrediente XOR preparação), o caminho honesto é recusar
 * apontando quais faltam.
 */
export function nfeItemsReceivingProblem(items: readonly NfeItemForReceiving[]): string | null {
	const resolvable = items.filter((item) => item.ingredient_id != null)
	if (resolvable.length === 0) return "Nenhum item da NF-e está vinculado a um insumo — resolva o matching antes de receber"
	const unresolved = items.filter((item) => item.ingredient_id == null)
	if (unresolved.length === 0) return null
	// Nº do item na nota + descrição: é o que o conferente acha no DANFE. O id interno
	// que ia aqui não dizia nada a ninguém.
	const descriptions = unresolved
		.slice(0, 5)
		.map((item) => `#${item.n_item ?? "?"} ${item.description ?? item.id}`)
		.join("; ")
	return `${unresolved.length} item(ns) da NF-e ainda sem insumo vinculado — resolva o matching antes de receber (itens: ${descriptions}${unresolved.length > 5 ? "…" : ""})`
}

/** Falha ao inserir o recebimento da nota: a chave única tem frase própria. */
export function nfeReceiptInsertMessage(error: DbErrorLike | null): string {
	if (error?.code === "23505") return "Esta NF-e já tem um recebimento em andamento ou efetivado"
	return `Erro ao criar recebimento: ${publicDbMessage(error)}`
}

export interface NfeItemRow {
	id: string
	ingredient_id: string
	ingredient_item_id: string | null
	purchase_item_id: string | null
	matched_qty_base: number | null
	unit_price: number | null
	commercial_qty: number | null
	lot_code: string | null
	expiry_date: string | null
}

/** Um `goods_receipt_item` por item da nota, com o rastro de lote/validade para o lote inicial. */
export function prepareNfeReceiptItems(items: readonly NfeItemRow[], receiptId: string) {
	return items.map((item) => {
		const invoiced = item.matched_qty_base
		// Custo na unidade BASE: a nota preça a embalagem, o ledger valora o gênero.
		// Ver `unitCostFromNfe` — extraída para poder ser testada.
		const unitCostBase = unitCostFromNfe({ invoicedQtyBase: invoiced, unitPrice: item.unit_price, commercialQty: item.commercial_qty })
		return {
			row: {
				receipt_id: receiptId,
				nfe_item_id: item.id,
				ingredient_id: item.ingredient_id,
				frozen_preparation_id: null,
				ingredient_item_id: item.ingredient_item_id,
				purchase_item_id: item.purchase_item_id,
				invoiced_qty_base: invoiced,
				received_qty_base: invoiced ?? 0,
				unit_cost: unitCostBase,
			},
			lotCode: item.lot_code,
			expiryDate: item.expiry_date,
		}
	})
}

/**
 * Valor da linha da nota, para o custo da linha sem conversão: o custo de aquisição, senão o
 * valor do produto, senão preço × quantidade comercial.
 */
export function invoiceLineValue(
	nfe: { acquisition_cost: number | null; product_value: number | null; unit_price: number | null; commercial_qty: number | null } | null
): number | null {
	const lineValue =
		nfe?.acquisition_cost ?? nfe?.product_value ?? (nfe?.unit_price != null && nfe?.commercial_qty != null ? nfe.unit_price * nfe.commercial_qty : null)
	return lineValue == null ? null : Number(lineValue)
}

// ── Entrega sem NF-e ───────────────────────────────────────────────────────

export interface ReceiptLine {
	ingredientId: string
	quantityBase: number
	unitCost?: number | null
	lotCode?: string | null
	expiryDate?: string | null
}

export interface ReceiptWithoutInvoiceData {
	kitchenId: number
	source: "delivery_note" | "ad_hoc"
	deliveryNoteNumber?: string | null
	supplierName?: string | null
	supplierDocument?: string | null
	invoiceExpected: boolean
	supplyOrderId?: string | null
	notes?: string | null
	lines: ReceiptLine[]
}

export function withoutInvoiceProblems(data: ReceiptWithoutInvoiceData): string[] {
	return receiptWithoutInvoiceProblems({
		source: data.source,
		deliveryNoteNumber: data.deliveryNoteNumber ?? null,
		supplierDocument: data.supplierDocument ?? null,
		lines: data.lines,
	})
}

/** Descrição de cada insumo vivo; o excluído fica fora, e a linha que o usa é recusada. */
export function knownIngredientLabels(rows: ReadonlyArray<{ id: string; description: string | null; deleted_at: string | null }> | null): Map<string, string> {
	const known = new Map<string, string>()
	for (const row of rows ?? []) {
		if (row.deleted_at == null) known.set(row.id, itemDescription(row.description))
	}
	return known
}

/** Especificação de compra padrão de cada insumo. */
export function defaultPurchaseItems(rows: ReadonlyArray<{ ingredient_id: string; purchase_item_id: string }> | null): Map<string, string> {
	const purchaseItemBy = new Map<string, string>()
	for (const row of rows ?? []) purchaseItemBy.set(row.ingredient_id, row.purchase_item_id)
	return purchaseItemBy
}

/** O `goods_receipt` da entrega sem nota; fornecedor em branco cai no favorecido do empenho. */
export function withoutInvoiceReceiptRow(
	data: ReceiptWithoutInvoiceData,
	resolved: { empenhoId: string | null; empenho: { favorecido_nome: string | null; favorecido_cnpj: string | null } | null },
	userId: string
) {
	const { empenho } = resolved
	return {
		kitchen_id: data.kitchenId,
		source: data.source,
		delivery_note_number: data.deliveryNoteNumber?.trim() || null,
		supplier_name: data.supplierName?.trim() || empenho?.favorecido_nome || null,
		supplier_document: normalizeSupplierDocument(data.supplierDocument) ?? empenho?.favorecido_cnpj ?? null,
		invoice_expected: data.invoiceExpected,
		supply_order_id: data.supplyOrderId ?? null,
		empenho_id: resolved.empenhoId,
		notes: data.notes?.trim() || null,
		created_by: userId,
	}
}

export function withoutInvoiceItemRows(lines: readonly ReceiptLine[], receiptId: string, purchaseItemBy: ReadonlyMap<string, string>) {
	return lines.map((line) => ({
		receipt_id: receiptId,
		ingredient_id: line.ingredientId,
		frozen_preparation_id: null,
		purchase_item_id: purchaseItemBy.get(line.ingredientId) ?? null,
		// sem nota, não há faturado: a linha não é "divergente" de nada
		invoiced_qty_base: null,
		received_qty_base: 0,
		unit_cost: line.unitCost ?? null,
	}))
}

export function itemsInsertFailureMessage(itemsError: DbErrorLike | null, rollbackError: DbErrorLike | null): string {
	return `Erro ao registrar os itens da entrega: ${publicDbMessage(itemsError)}${rollbackError ? ` (e o recebimento vazio ficou em rascunho: ${publicDbMessage(rollbackError)})` : ""}`
}

export interface InsertedReceiptItem {
	id: string
	ingredient_id: string
	purchase_item_id: string | null
}

export function indexItemsByIngredient(
	items: ReadonlyArray<{ id: string; ingredient_id: string | null; purchase_item_id: string | null }>
): Map<string, InsertedReceiptItem> {
	const itemByIngredient = new Map<string, InsertedReceiptItem>()
	for (const item of items) if (item.ingredient_id) itemByIngredient.set(item.ingredient_id, { ...item, ingredient_id: item.ingredient_id })
	return itemByIngredient
}

function errorDetail(error: unknown): string {
	return error instanceof Error ? error.message : "erro"
}

export function quantityNotRecordedWarning(label: string, error: unknown): string {
	return `${label}: quantidade não registrada (${errorDetail(error)}) — informe na conferência`
}

export function shelfLifeNotCheckedWarning(label: string, error: unknown): string {
	return `${label}: validade mínima não conferida (${errorDetail(error)}) — informe lote e validade na conferência`
}

export function lotNotSavedWarning(label: string, error: DbErrorLike): string {
	return `${label}: lote e validade não gravados (${publicDbMessage(error)}) — informe na conferência`
}
