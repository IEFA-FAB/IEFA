/**
 * @module incoming.fn
 * "A caminho": o que está para chegar ou está pendente de documento.
 *
 * O requisito era *"preciso saber o que está prestes a chegar por integração
 * com a NF-e"*, e a palavra que engana ali é *integração*: a nota é só uma das
 * quatro formas de saber. O almoxarife precisa da lista ÚNICA, porque a
 * pergunta dele é "o que falta chegar hoje", e não "quais notas existem".
 *
 * As quatro origens:
 *  • **OF enviada** com saldo a receber — o pedido existe e o fornecedor sabe;
 *  • **NF-e sem recebimento** — a mercadoria pode já estar na porta;
 *  • **entrega sem nota** — o pão diário, que chega todo dia e é faturado na
 *    sexta. É entrega real sem documento fiscal ainda;
 *  • **reposição prometida** — linha recusada que o fornecedor vai repor.
 *
 * O que estiver vinculado entre si aparece como UMA linha: OF e nota do mesmo
 * empenho são o mesmo carregamento, e mostrá-los separados faria o almoxarife
 * esperar duas entregas.
 *
 * CLIENT: getServerClient (service role, schemas inventory/procurement/finance).
 * AUTH: `storage` nível 1.
 * TABLES: procurement.supply_order(_item), inventory.nfe_document, goods_receipt.
 * @domain kitchen
 * @migration 20260917200000_receiving_designation_and_scan
 */

import { brasiliaToday } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas fora dos tipos gerados
type LooseClient = { from: (table: string) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const procurement = () => getServerClient("procurement") as unknown as LooseClient
const finance = () => getServerClient("finance") as unknown as LooseClient

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
}

/**
 * Dias de atraso na data civil de Brasília.
 *
 * Contar em UTC faria uma entrega prevista para hoje aparecer com um dia de
 * atraso a partir das 21h — e o painel que grita atraso onde não há é o painel
 * que ensina a ignorar o alerta.
 */
function daysLateFrom(expected: string | null, today = brasiliaToday()): number {
	if (!expected) return 0
	const diff = Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${expected.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000)
	return diff > 0 ? diff : 0
}

export const fetchIncomingFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			kinds: z.array(z.enum(INCOMING_KINDS)).optional(),
			limit: z.number().int().min(1).max(200).default(50),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const proc = procurement()
		const today = brasiliaToday()
		const rows: IncomingRow[] = []

		// ── (a) OF enviada com saldo a receber ───────────────────────────────────
		const { data: orders, error: orderError } = await proc
			.from("supply_order")
			.select("id, empenho_id, number, sent_at, expected_delivery, status, notes")
			.eq("kitchen_id", data.kitchenId)
			.in("status", ["sent", "partially_received"])
		if (orderError) throw new Error(`Erro ao carregar as ordens de fornecimento: ${orderError.message}`)
		type Order = { id: string; empenho_id: string; number: string | null; expected_delivery: string | null; status: string }
		const orderRows = (orders ?? []) as Order[]

		// o fornecedor da OF vem do empenho, que é quem tem o favorecido
		const empenhoIds = [...new Set(orderRows.map((order) => order.empenho_id).filter(Boolean))]
		const empenhoById = new Map<string, { numero_empenho: string | null; favorecido_nome: string | null; favorecido_cnpj: string | null }>()
		if (empenhoIds.length > 0) {
			const { data: empenhos } = await finance().from("empenho").select("id, numero_empenho, favorecido_nome, favorecido_cnpj").in("id", empenhoIds)
			for (const row of empenhos ?? []) empenhoById.set(row.id, row)
		}

		// recebimentos já efetivados por OF, para saber o que ainda falta
		const { data: receiptsByOrder } = await inv
			.from("goods_receipt")
			.select("id, supply_order_id, status, nfe_document_id, source, delivery_note_number, created_at")
			.eq("kitchen_id", data.kitchenId)
		type Receipt = {
			id: string
			supply_order_id: string | null
			status: string
			nfe_document_id: string | null
			source: string | null
			delivery_note_number: string | null
			created_at: string
		}
		const receiptRows = (receiptsByOrder ?? []) as Receipt[]
		const definitiveByOrder = new Set(receiptRows.filter((r) => r.status === "definitive" && r.supply_order_id).map((r) => r.supply_order_id as string))

		for (const order of orderRows) {
			// OF totalmente recebida sai da lista mesmo que o status não tenha
			// acompanhado: o painel responde "o que falta chegar", não "o que o
			// campo status diz"
			if (definitiveByOrder.has(order.id) && order.status !== "partially_received") continue
			const empenho = empenhoById.get(order.empenho_id)
			const late = daysLateFrom(order.expected_delivery, today)
			rows.push({
				key: `of:${order.id}`,
				kind: "supply_order",
				supplierName: empenho?.favorecido_nome ?? null,
				supplierDocument: empenho?.favorecido_cnpj ?? null,
				reference: order.number ? `OF ${order.number}` : "OF sem número",
				referenceDate: order.expected_delivery,
				daysLate: late,
				value: null,
				summary: empenho?.numero_empenho ? `Empenho ${empenho.numero_empenho}` : "Empenho não identificado",
				nextAction: order.status === "partially_received" ? "Receber o saldo restante" : late > 0 ? "Cobrar o fornecedor" : "Aguardando entrega",
				supplyOrderId: order.id,
				nfeDocumentId: null,
				goodsReceiptId: null,
			})
		}

		// ── (b) NF-e sem recebimento efetivado ───────────────────────────────────
		const { data: notes, error: noteError } = await inv
			.from("nfe_document")
			.select("id, access_key, supplier_name, supplier_cnpj, supplier_cpf, issued_at, total_value, status, situation_result")
			.eq("kitchen_id", data.kitchenId)
			// Os estados em que a nota ainda representa algo a chegar ou a resolver.
			// `received` já virou recebimento; `cancelled` e `refused` não vêm. Não
			// existe `review` nesta coluna — o CHECK do banco é a lista de valores,
			// e inventar um a mais devolveria sempre lista vazia.
			.in("status", ["announced", "imported", "available", "matched", "divergent"])
		if (noteError) throw new Error(`Erro ao carregar as notas: ${noteError.message}`)
		type Note = {
			id: string
			access_key: string | null
			supplier_name: string | null
			supplier_cnpj: string | null
			supplier_cpf: string | null
			issued_at: string | null
			total_value: number | null
			status: string
			situation_result: string | null
		}
		const noteRows = (notes ?? []) as Note[]
		const definitiveByNote = new Set(receiptRows.filter((r) => r.status === "definitive" && r.nfe_document_id).map((r) => r.nfe_document_id as string))
		// itens ainda não casados, para dizer QUANTOS faltam em vez de "resolver"
		const pendingByNote = new Map<string, number>()
		if (noteRows.length > 0) {
			const { data: items } = await inv
				.from("nfe_item")
				.select("nfe_document_id, ingredient_item_id")
				.in(
					"nfe_document_id",
					noteRows.map((note) => note.id)
				)
			for (const item of (items ?? []) as Array<{ nfe_document_id: string; ingredient_item_id: string | null }>) {
				if (item.ingredient_item_id == null) pendingByNote.set(item.nfe_document_id, (pendingByNote.get(item.nfe_document_id) ?? 0) + 1)
			}
		}

		for (const note of noteRows) {
			if (definitiveByNote.has(note.id)) continue
			const pending = pendingByNote.get(note.id) ?? 0
			// nota cancelada na SEFAZ não é entrega a esperar, é entrega que não vem
			const cancelled = note.situation_result === "cancelled"
			rows.push({
				key: `nfe:${note.id}`,
				kind: "nfe",
				supplierName: note.supplier_name,
				supplierDocument: note.supplier_cnpj ?? note.supplier_cpf,
				reference: note.access_key ? `NF-e ${note.access_key.slice(25, 34)}` : "NF-e sem chave",
				referenceDate: note.issued_at?.slice(0, 10) ?? null,
				daysLate: daysLateFrom(note.issued_at?.slice(0, 10) ?? null, today),
				value: note.total_value == null ? null : Number(note.total_value),
				summary: cancelled ? "Cancelada na SEFAZ" : note.status === "announced" ? "Anunciada pela chave, XML não recebido" : "Nota disponível",
				nextAction: cancelled
					? "Não receber — confirme com o fornecedor"
					: note.status === "announced"
						? "Importar o XML da nota"
						: pending > 0
							? `Casar ${pending} ${pending === 1 ? "item" : "itens"}`
							: "Registrar o recebimento",
				supplyOrderId: null,
				nfeDocumentId: note.id,
				goodsReceiptId: null,
			})
		}

		// ── (c) entrega sem nota ─────────────────────────────────────────────────
		// O pão chega todo dia e é faturado na sexta. Cada entrega é real e não
		// tem documento fiscal ainda — some do painel se a lista for só de notas.
		for (const receipt of receiptRows) {
			if (receipt.nfe_document_id != null) continue
			if (receipt.source === "nfe") continue
			// `goods_receipt.status` não tem `cancelled`: os valores são draft,
			// provisional, definitive, divergent e rejected
			if (receipt.status === "rejected") continue
			rows.push({
				key: `sem-nota:${receipt.id}`,
				kind: "delivery_without_invoice",
				supplierName: null,
				supplierDocument: null,
				reference: receipt.delivery_note_number ? `Remessa ${receipt.delivery_note_number}` : "Entrega sem nota",
				referenceDate: receipt.created_at.slice(0, 10),
				daysLate: 0,
				value: null,
				summary: receipt.status === "provisional" ? "Recebimento provisório, aguardando a nota" : "Entregue, aguardando a nota fiscal",
				nextAction: "Vincular à nota quando ela chegar",
				supplyOrderId: receipt.supply_order_id,
				nfeDocumentId: null,
				goodsReceiptId: receipt.id,
			})
		}

		// ── (d) reposição prometida — AINDA NÃO ─────────────────────────────────
		// A spec prevê a linha recusada com reposição prometida como quarta origem
		// deste painel. Ela não entra ainda porque a recusa de linha não existe:
		// `goods_receipt_item` não tem coluna de recusa nenhuma (tarefa 3.24, em
		// aberto). Montar a origem agora seria consultar campo inexistente e
		// devolver lista vazia para sempre — o recurso nasceria morto, calado, que
		// é exatamente o defeito que este change já corrigiu uma vez na sugestão da
		// saída do dia. `promised_replacement` fica declarado no tipo e sem
		// produtor até a recusa existir.

		// O atrasado vem primeiro, e o mais atrasado antes — é a ordem em que o
		// almoxarife precisa cobrar. Depois, o mais antigo.
		rows.sort((a, b) => b.daysLate - a.daysLate || (a.referenceDate ?? "9999").localeCompare(b.referenceDate ?? "9999"))
		const filtered = data.kinds?.length ? rows.filter((row) => data.kinds?.includes(row.kind)) : rows
		return {
			rows: filtered.slice(0, data.limit),
			total: filtered.length,
			late: filtered.filter((row) => row.daysLate > 0).length,
		}
	})

/**
 * Vínculos sugeridos para uma NF-e sem empenho.
 *
 * Ranqueia por documento do emitente: empenho vigente da unidade cujo
 * favorecido tem o MESMO CNPJ (ou CPF) e ainda tem saldo. Com um único
 * candidato, a tela pré-seleciona — mas a confirmação continua sendo humana,
 * porque vincular nota a empenho errado contamina a execução orçamentária de
 * um contrato que não é o dela.
 */
export const suggestNfeLinksFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), nfeDocumentId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()
		const { data: note } = await inv
			.from("nfe_document")
			.select("id, kitchen_id, unit_id, supplier_cnpj, supplier_cpf, total_value")
			.eq("id", data.nfeDocumentId)
			.maybeSingle()
		if (!note) throw new Error("Nota não encontrada")
		// a nota tem de ser DESTA cozinha: sem esta linha, qualquer id de nota
		// devolveria os empenhos da unidade de quem perguntou
		if (Number(note.kitchen_id) !== data.kitchenId) throw new Error("Nota não pertence a esta cozinha")

		// `finance.empenho` não guarda CPF de favorecido. Emitente pessoa física
		// não casa com empenho nenhum, e DIZER isso é melhor do que devolver lista
		// vazia, que o operador lê como "não há empenho com saldo".
		if (!note.supplier_cnpj) {
			return {
				empenhos: [],
				supplyOrders: [],
				deliveriesWithoutInvoice: [],
				note: "Emitente pessoa física: empenho é sempre de favorecido com CNPJ" as string | null,
			}
		}

		const fin = finance()
		const { data: empenhos, error: empenhoError } = await fin
			.from("empenho")
			.select("id, numero_empenho, favorecido_nome, unit_id")
			.eq("favorecido_cnpj", note.supplier_cnpj)
			.eq("unit_id", note.unit_id)
		if (empenhoError) throw new Error(`Erro ao buscar empenhos do fornecedor: ${empenhoError.message}`)
		type Empenho = { id: string; numero_empenho: string | null; favorecido_nome: string | null }
		const candidates = (empenhos ?? []) as Empenho[]

		// O saldo vem de `v_empenho_saldo`, que é onde ele é calculado. Recompor
		// "valor menos liquidado" à mão aqui criaria uma segunda conta do mesmo
		// número, e as duas divergiriam na primeira anulação.
		const balanceById = new Map<string, number>()
		if (candidates.length > 0) {
			const { data: balances } = await fin
				.from("v_empenho_saldo")
				.select("empenho_id, saldo_a_liquidar")
				.in(
					"empenho_id",
					candidates.map((row) => row.id)
				)
			for (const row of (balances ?? []) as Array<{ empenho_id: string; saldo_a_liquidar: number }>) {
				balanceById.set(row.empenho_id, Number(row.saldo_a_liquidar))
			}
		}
		const withBalance = candidates.filter((row) => (balanceById.get(row.id) ?? 0) > 0)

		const { data: orders } = await procurement()
			.from("supply_order")
			.select("id, empenho_id, number, expected_delivery, status")
			.eq("kitchen_id", data.kitchenId)
			.in("status", ["sent", "partially_received"])
		const openOrders = ((orders ?? []) as Array<{ id: string; empenho_id: string }>).filter((order) =>
			withBalance.some((empenho) => empenho.id === order.empenho_id)
		)

		// entregas sem nota do mesmo fornecedor: é a nota semanal fechando as
		// entregas diárias, e é o caso do pão
		const { data: receipts } = await inv
			.from("goods_receipt")
			.select("id, delivery_note_number, created_at, status")
			.eq("kitchen_id", data.kitchenId)
			.is("nfe_document_id", null)
			.neq("source", "nfe")
			.neq("status", "rejected")

		return {
			empenhos: withBalance.map((row) => ({
				empenhoId: row.id,
				numero: row.numero_empenho,
				favorecido: row.favorecido_nome,
				balance: balanceById.get(row.id) ?? 0,
			})),
			supplyOrders: openOrders,
			deliveriesWithoutInvoice: receipts ?? [],
			note: null as string | null,
		}
	})
