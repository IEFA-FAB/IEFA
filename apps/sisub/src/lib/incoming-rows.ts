/**
 * Montagem das linhas do painel "A caminho" (`fetchIncomingFn`, em `incoming.fn.ts`).
 *
 * As leituras ficam na fn; aqui mora só o que se decide com elas na mão: o que cada origem
 * (OF, NF-e, entrega sem nota) diz ao almoxarife, o atraso e a ordem da lista. Fica fora de
 * `incoming.fn.ts` porque teste unitário não importa `@/server/*`.
 */

import { getBrasiliaToday } from "@iefa/sisub-domain"

export const INCOMING_KINDS = ["supply_order", "nfe", "delivery_without_invoice", "promised_replacement"] as const
export type IncomingKind = (typeof INCOMING_KINDS)[number]

export interface IncomingRow {
	key: string
	kind: IncomingKind
	supplierName: string | null
	supplierDocument: string | null
	reference: string
	/** Data prevista (OF) ou de emissão (NF-e), ISO date. */
	referenceDate: string | null
	/** Dias de atraso contra a data prevista; 0 quando não há previsão ou não atrasou. */
	daysLate: number
	value: number | null
	summary: string
	/** O que fazer agora — e é isto que o almoxarife lê primeiro. */
	nextAction: string
	/** Identificadores para o atalho da tela. */
	supplyOrderId: string | null
	nfeDocumentId: string | null
	goodsReceiptId: string | null
	/** Nota da unidade que nenhuma cozinha reivindicou: a ação é na lista de notas. */
	unclaimedNote: boolean
}

/**
 * Dias de atraso na data civil de Brasília.
 *
 * Contar em UTC faria uma entrega prevista para hoje aparecer com um dia de
 * atraso a partir das 21h — e o painel que grita atraso onde não há é o painel
 * que ensina a ignorar o alerta.
 */
export function daysLateFrom(expected: string | null, today = getBrasiliaToday()): number {
	if (!expected) return 0
	const diff = Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${expected.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000)
	return diff > 0 ? diff : 0
}

/**
 * Data civil de Brasília de um instante. Cortar o ISO em UTC punha a nota
 * emitida às 22h no dia seguinte — e mudava a ordem "mais antigo primeiro".
 */
export function civilDate(timestamp: string): string {
	return getBrasiliaToday(new Date(timestamp))
}

// ── (a) OF enviada com saldo a receber ─────────────────────────────────────

export interface IncomingOrder {
	id: string
	empenho_id: string | null
	number: string | null
	expected_delivery: string | null
	status: string
}

export interface IncomingEmpenho {
	numero_empenho: string | null
	favorecido_nome: string | null
	favorecido_cnpj: string | null
}

/** Recebimentos das OFs: as efetivadas e, das que não, o recebimento em andamento. */
export interface OrderReceiptIndex {
	definitiveByOrder: Set<string>
	openByOrder: Map<string, string>
}

export function indexOrderReceipts(receipts: ReadonlyArray<{ id: string; supply_order_id: string | null; definitive_at: string | null }>): OrderReceiptIndex {
	const definitiveByOrder = new Set<string>()
	const openByOrder = new Map<string, string>()
	for (const row of receipts) {
		if (row.supply_order_id == null) continue // filtrado no `.in()`; o tipo só o declara nulável
		if (row.definitive_at != null) definitiveByOrder.add(row.supply_order_id)
		else openByOrder.set(row.supply_order_id, row.id)
	}
	return { definitiveByOrder, openByOrder }
}

/**
 * OF totalmente recebida sai da lista mesmo que o status não tenha
 * acompanhado: o painel responde "o que falta chegar", não "o que o
 * campo status diz"
 */
export function isOrderFullyReceived(order: IncomingOrder, index: OrderReceiptIndex): boolean {
	return index.definitiveByOrder.has(order.id) && order.status !== "partially_received" && !index.openByOrder.has(order.id)
}

export function describeSupplyOrderSummary(order: IncomingOrder, empenho: IncomingEmpenho | undefined): string {
	if (empenho?.numero_empenho) return `Empenho ${empenho.numero_empenho}`
	return order.empenho_id == null ? "Aguardando empenho" : "Empenho não identificado"
}

export function describeSupplyOrderNextAction(order: IncomingOrder, openReceiptId: string | null, late: number): string {
	if (openReceiptId) return "Concluir o recebimento"
	if (order.status === "partially_received") return "Receber o saldo restante"
	return late > 0 ? "Cobrar o fornecedor" : "Aguardando entrega"
}

export function buildSupplyOrderRows(
	orders: readonly IncomingOrder[],
	empenhoById: ReadonlyMap<string, IncomingEmpenho>,
	index: OrderReceiptIndex,
	today: string
): IncomingRow[] {
	const rows: IncomingRow[] = []
	for (const order of orders) {
		if (isOrderFullyReceived(order, index)) continue
		const empenho = order.empenho_id ? empenhoById.get(order.empenho_id) : undefined
		const openReceiptId = index.openByOrder.get(order.id) ?? null
		// chegou e está sendo conferido: não há o que cobrar
		const late = openReceiptId ? 0 : daysLateFrom(order.expected_delivery, today)
		rows.push({
			key: `of:${order.id}`,
			kind: "supply_order",
			supplierName: empenho?.favorecido_nome ?? null,
			supplierDocument: empenho?.favorecido_cnpj ?? null,
			reference: order.number ? `OF ${order.number}` : "OF sem número",
			referenceDate: order.expected_delivery,
			daysLate: late,
			value: null,
			summary: describeSupplyOrderSummary(order, empenho),
			nextAction: describeSupplyOrderNextAction(order, openReceiptId, late),
			supplyOrderId: order.id,
			nfeDocumentId: null,
			goodsReceiptId: openReceiptId,
			unclaimedNote: false,
		})
	}
	return rows
}

// ── (b) NF-e sem recebimento efetivado ─────────────────────────────────────

/**
 * Nota da cozinha E nota enviada à UNIDADE compradora que nenhuma cozinha
 * reivindicou ainda (`kitchen_id` nulo).
 */
export function buildIncomingNoteScope(kitchenId: number, purchaseUnit: number | null): string {
	return purchaseUnit == null ? `kitchen_id.eq.${kitchenId}` : `kitchen_id.eq.${kitchenId},and(kitchen_id.is.null,unit_id.eq.${purchaseUnit})`
}

export interface IncomingNote {
	id: string
	access_key: string | null
	supplier_name: string | null
	supplier_cnpj: string | null
	supplier_cpf: string | null
	issued_at: string | null
	total_value: number | string | null
	status: string
	situation_result: string | null
	kitchen_id: number | null
}

/** Recebimentos das notas, de qualquer cozinha: efetivados, em andamento aqui e em andamento em outra. */
export interface NoteReceiptIndex {
	definitiveByNote: Set<string>
	openHereByNote: Map<string, string>
	openElsewhere: Set<string>
}

export function indexNoteReceipts(
	receipts: ReadonlyArray<{ id: string; nfe_document_id: string | null; kitchen_id: number | string | null; definitive_at: string | null }>,
	kitchenId: number
): NoteReceiptIndex {
	const definitiveByNote = new Set<string>()
	const openHereByNote = new Map<string, string>()
	const openElsewhere = new Set<string>()
	for (const row of receipts) {
		if (row.nfe_document_id == null) continue // filtrado no `.in()`
		if (row.definitive_at != null) definitiveByNote.add(row.nfe_document_id)
		else if (Number(row.kitchen_id) === kitchenId) openHereByNote.set(row.nfe_document_id, row.id)
		else openElsewhere.add(row.nfe_document_id)
	}
	return { definitiveByNote, openHereByNote, openElsewhere }
}

/** Itens ainda não casados, por nota. */
export function countPendingByNote(items: ReadonlyArray<{ nfe_document_id: string }>): Map<string, number> {
	const pendingByNote = new Map<string, number>()
	for (const item of items) pendingByNote.set(item.nfe_document_id, (pendingByNote.get(item.nfe_document_id) ?? 0) + 1)
	return pendingByNote
}

/** O estado da nota que decide o resumo e a ação da linha. */
interface NoteState {
	cancelled: boolean
	openReceiptId: string | null
	unclaimed: boolean
	announced: boolean
	pending: number
}

export function describeNfeSummary(state: NoteState): string {
	if (state.cancelled) return "Cancelada na SEFAZ"
	if (state.openReceiptId) return "Recebimento em andamento"
	if (state.unclaimed) return "Enviada à unidade, ainda sem cozinha"
	return state.announced ? "Anunciada pela chave, XML não recebido" : "Nota disponível"
}

export function describeNfeNextAction(state: NoteState): string {
	if (state.cancelled) return "Não receber — confirme com o fornecedor"
	if (state.openReceiptId) return "Concluir o recebimento"
	if (state.unclaimed) return "Assumir a nota para esta cozinha"
	if (state.announced) return "Importar o XML da nota"
	return state.pending > 0 ? `Casar ${state.pending} ${state.pending === 1 ? "item" : "itens"}` : "Registrar o recebimento"
}

export function buildNfeRows(notes: readonly IncomingNote[], index: NoteReceiptIndex, pendingByNote: ReadonlyMap<string, number>): IncomingRow[] {
	const rows: IncomingRow[] = []
	for (const note of notes) {
		if (index.definitiveByNote.has(note.id)) continue
		const openReceiptId = index.openHereByNote.get(note.id) ?? null
		// outra cozinha está recebendo esta nota — não é mais "a caminho" daqui
		if (openReceiptId == null && index.openElsewhere.has(note.id)) continue
		const state: NoteState = {
			// nota cancelada na SEFAZ não é entrega a esperar, é entrega que não vem
			cancelled: note.situation_result === "cancelled",
			openReceiptId,
			unclaimed: note.kitchen_id == null,
			announced: note.status === "announced",
			pending: pendingByNote.get(note.id) ?? 0,
		}
		rows.push({
			key: `nfe:${note.id}`,
			kind: "nfe",
			supplierName: note.supplier_name,
			supplierDocument: note.supplier_cnpj ?? note.supplier_cpf,
			reference: note.access_key ? `NF-e ${note.access_key.slice(25, 34)}` : "NF-e sem chave",
			referenceDate: note.issued_at ? civilDate(note.issued_at) : null,
			// NF-e não tem data ESPERADA — só a de emissão. Contar atraso a partir
			// dela dava "1 dia de atraso" a toda nota de ontem, inflava o contador
			// e passava nota comum à frente de OF realmente atrasada.
			daysLate: 0,
			value: note.total_value == null ? null : Number(note.total_value),
			summary: describeNfeSummary(state),
			nextAction: describeNfeNextAction(state),
			supplyOrderId: null,
			nfeDocumentId: note.id,
			goodsReceiptId: openReceiptId,
			unclaimedNote: note.kitchen_id == null,
		})
	}
	return rows
}

// ── (c) entrega sem nota ───────────────────────────────────────────────────

export interface UnbilledReceipt {
	id: string
	supply_order_id: string | null
	status: string
	delivery_note_number: string | null
	supplier_name: string | null
	supplier_document: string | null
	created_at: string
}

export function buildUnbilledRows(receipts: readonly UnbilledReceipt[]): IncomingRow[] {
	return receipts.map((receipt) => ({
		key: `sem-nota:${receipt.id}`,
		kind: "delivery_without_invoice",
		supplierName: receipt.supplier_name,
		supplierDocument: receipt.supplier_document,
		reference: receipt.delivery_note_number ? `Remessa ${receipt.delivery_note_number}` : "Entrega sem nota",
		referenceDate: civilDate(receipt.created_at),
		daysLate: 0,
		value: null,
		summary: receipt.status === "provisional" ? "Recebimento provisório, aguardando a nota" : "Entregue, aguardando a nota fiscal",
		nextAction: "Vincular à nota quando ela chegar",
		supplyOrderId: receipt.supply_order_id,
		nfeDocumentId: null,
		goodsReceiptId: receipt.id,
		unclaimedNote: false,
	}))
}

// ── ordem e corte ──────────────────────────────────────────────────────────

/**
 * O atrasado vem primeiro, e o mais atrasado antes — é a ordem em que o
 * almoxarife precisa cobrar. Depois, o mais antigo. Ordena `rows` no lugar.
 */
export function paginateIncoming(rows: IncomingRow[], kinds: readonly IncomingKind[] | undefined, limit: number) {
	rows.sort((a, b) => b.daysLate - a.daysLate || (a.referenceDate ?? "9999").localeCompare(b.referenceDate ?? "9999"))
	const filtered = kinds?.length ? rows.filter((row) => kinds?.includes(row.kind)) : rows
	return {
		rows: filtered.slice(0, limit),
		total: filtered.length,
		late: filtered.filter((row) => row.daysLate > 0).length,
	}
}
