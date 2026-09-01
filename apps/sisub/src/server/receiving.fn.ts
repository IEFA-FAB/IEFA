/**
 * @module receiving.fn
 * Recebimento físico em dois estágios (Lei 14.133, art. 140): draft →
 * provisional → definitive/divergent. Só a efetivação do definitivo (função
 * SQL atômica) cria lotes + movimentos e atualiza o status da OF.
 *
 * O lote é filho da linha do item (`goods_receipt_item_lot`): uma entrega traz
 * caixas de validades diferentes do mesmo item, e é a validade que dirige o
 * FEFO. A temperatura aferida também mora no lote — as caixas congeladas e as
 * resfriadas da mesma entrega podem chegar em condições diferentes. Medir é
 * opcional e nunca bloqueia; fora da faixa vira divergência com registro de
 * quem aceitou.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen/procurement).
 * AUTH: `storage` nível 2 (provisório), nível 3 (definitivo).
 * @domain kitchen
 * @migration 20260901120200_goods_receipt_lots
 */

import { type ConservationClass, isTemperatureOutOfRange, temperatureDivergenceReason, temperatureVerdict } from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas do módulo inventory ainda fora dos tipos gerados até o regen pós-migration
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const procurement = () => getServerClient("procurement") as unknown as LooseClient

const IsoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.nullable()

/** Recebimento já efetivado não aceita mais escrita — nem de lote. */
async function requireOpenReceipt(receiptId: string, level: 2 | 3) {
	const inv = inventory()
	const { data: receipt } = await inv.from("goods_receipt").select("id, status, kitchen_id").eq("id", receiptId).maybeSingle()
	if (!receipt) throw new Error("Recebimento não encontrado")
	const auth = await requireStorageForKitchen(level, Number(receipt.kitchen_id))
	if (receipt.status === "definitive") throw new Error("Recebimento já efetivado — não pode ser alterado")
	return { receipt, ...auth }
}

/** Sobe da linha do lote até o recebimento, para autorizar por cozinha. */
async function receiptIdForLotItem(receiptItemId: string): Promise<string> {
	const { data: item } = await inventory().from("goods_receipt_item").select("receipt_id").eq("id", receiptItemId).maybeSingle()
	if (!item) throw new Error("Item do recebimento não encontrado")
	return item.receipt_id as string
}

/**
 * Faixa de temperatura exigida pela especificação de compra da linha.
 * Sem purchase_item na linha, cai na especificação padrão do insumo — a mesma
 * resolução que `finalize_goods_receipt` faz para gravar a classe no lote.
 */
async function requiredRangeFor(
	purchaseItemId: string | null,
	ingredientId: string | null
): Promise<{ minC: number | null; maxC: number | null; conservationClass: ConservationClass | null }> {
	const proc = procurement()
	const columns = "conservation_class, storage_temp_min_c, storage_temp_max_c"

	let spec: Record<string, unknown> | null = null
	if (purchaseItemId) {
		const { data } = await proc.from("purchase_item").select(columns).eq("id", purchaseItemId).maybeSingle()
		spec = data ?? null
	}
	if (!spec && ingredientId) {
		const { data } = await proc
			.from("purchase_item_ingredient")
			.select(`purchase_item:purchase_item_id (${columns})`)
			.eq("ingredient_id", ingredientId)
			.eq("is_default", true)
			.maybeSingle()
		spec = (data as { purchase_item?: Record<string, unknown> } | null)?.purchase_item ?? null
	}

	return {
		minC: spec?.storage_temp_min_c != null ? Number(spec.storage_temp_min_c) : null,
		maxC: spec?.storage_temp_max_c != null ? Number(spec.storage_temp_max_c) : null,
		conservationClass: (spec?.conservation_class as ConservationClass | undefined) ?? null,
	}
}

/**
 * Cria o recebimento a partir de uma NF-e conferida: um goods_receipt_item por
 * nfe_item resolvido, e um lote inicial por item com o rastro da nota
 * (lote/validade), que o conferente desdobra em vários se a carga vier
 * fracionada.
 */
export const createReceiptFromNfeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			nfeDocumentId: z.uuid(),
			supplyOrderId: z.uuid().optional(),
			empenhoId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()

		// refs cruzadas precisam ser da MESMA cozinha (review: receipt podia
		// apontar NF-e/OF de outra cozinha e movimentar o ledger errado)
		const { data: doc } = await inv.from("nfe_document").select("kitchen_id").eq("id", data.nfeDocumentId).maybeSingle()
		if (!doc) throw new Error("NF-e não encontrada")
		if (doc.kitchen_id != null && Number(doc.kitchen_id) !== data.kitchenId) {
			throw new Error("NF-e pertence a outra cozinha")
		}
		if (data.supplyOrderId) {
			const proc = procurement()
			const { data: order } = await proc.from("supply_order").select("kitchen_id").eq("id", data.supplyOrderId).maybeSingle()
			if (!order || Number(order.kitchen_id) !== data.kitchenId) throw new Error("OF não encontrada ou de outra cozinha")
		}

		const { data: items, error: itemsError } = await inv
			.from("nfe_item")
			.select("id, ingredient_id, ingredient_item_id, purchase_item_id, matched_qty_base, unit_price, commercial_qty, lot_code, expiry_date, match_status")
			.eq("nfe_document_id", data.nfeDocumentId)
		if (itemsError) throw new Error(`Erro ao carregar itens da NF-e: ${itemsError.message}`)

		const resolvable = (items ?? []).filter((item: { ingredient_id: string | null }) => item.ingredient_id != null)
		if (resolvable.length === 0) {
			throw new Error("Nenhum item da NF-e está vinculado a um insumo — resolva o matching antes de receber")
		}

		const { data: receipt, error } = await inv
			.from("goods_receipt")
			.insert({
				kitchen_id: data.kitchenId,
				nfe_document_id: data.nfeDocumentId,
				supply_order_id: data.supplyOrderId ?? null,
				empenho_id: data.empenhoId ?? null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !receipt) {
			if (error?.code === "23505") throw new Error("Esta NF-e já tem um recebimento em andamento ou efetivado")
			throw new Error(`Erro ao criar recebimento: ${error?.message}`)
		}

		type NfeItemRow = {
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

		const prepared = (resolvable as NfeItemRow[]).map((item) => {
			const invoiced = item.matched_qty_base
			// custo unitário na base: valor total do item / quantidade base
			const totalValue = item.unit_price != null && item.commercial_qty != null ? item.unit_price * item.commercial_qty : null
			const unitCostBase = totalValue != null && invoiced != null && invoiced > 0 ? Number((totalValue / invoiced).toFixed(4)) : null
			return {
				row: {
					receipt_id: receipt.id,
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

		const { data: inserted, error: insertError } = await inv
			.from("goods_receipt_item")
			.insert(prepared.map((entry) => entry.row))
			.select("id, nfe_item_id, received_qty_base, unit_cost")
		if (insertError || !inserted) {
			await inv.from("goods_receipt").delete().eq("id", receipt.id)
			throw new Error(`Erro ao criar itens do recebimento: ${insertError?.message}`)
		}

		// Lote inicial com o rastro da nota. Quantidade zero não gera lote: o
		// check `quantity_base > 0` recusaria, e um item faturado com zero é
		// justamente o que o conferente ainda vai preencher.
		const byNfeItem = new Map(prepared.map((entry) => [entry.row.nfe_item_id, entry]))
		const lotRows = (inserted as Array<{ id: string; nfe_item_id: string; received_qty_base: number; unit_cost: number | null }>)
			.filter((item) => Number(item.received_qty_base) > 0)
			.map((item, index) => {
				const source = byNfeItem.get(item.nfe_item_id)
				return {
					receipt_item_id: item.id,
					lot_code: source?.lotCode?.trim() || `SEM-LOTE-${new Date().toISOString().slice(0, 10)}-${index + 1}`,
					expiry_date: source?.expiryDate ?? null,
					quantity_base: Number(item.received_qty_base),
					unit_cost: item.unit_cost,
				}
			})

		if (lotRows.length > 0) {
			const { error: lotError } = await inv.from("goods_receipt_item_lot").insert(lotRows)
			if (lotError) {
				await inv.from("goods_receipt").delete().eq("id", receipt.id)
				throw new Error(`Erro ao criar lotes do recebimento: ${lotError.message}`)
			}
		}

		return { receiptId: receipt.id as string, itemsCount: prepared.length, skipped: (items ?? []).length - prepared.length }
	})

/** Conferência da LINHA: quantidade física + motivo de divergência. Lote é escrita à parte. */
export const updateReceiptItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptItemId: z.uuid(),
			receivedQtyBase: z.number().nonnegative(),
			divergenceReason: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 2)
		const inv = inventory()

		const { data: item } = await inv.from("goods_receipt_item").select("id, invoiced_qty_base, receipt_id").eq("id", data.receiptItemId).single()
		if (!item) throw new Error("Item do recebimento não encontrado")
		await requireOpenReceipt(item.receipt_id as string, 2)

		const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
		const diverges = invoiced != null && data.receivedQtyBase !== invoiced
		if (diverges && !data.divergenceReason?.trim()) {
			throw new Error("Quantidade física difere da faturada — informe o motivo da divergência")
		}

		const { error } = await inv
			.from("goods_receipt_item")
			.update({
				received_qty_base: data.receivedQtyBase,
				divergence_reason: diverges ? (data.divergenceReason?.trim() ?? null) : null,
			})
			.eq("id", data.receiptItemId)
		if (error) throw new Error(`Erro ao atualizar item: ${error.message}`)
	})

/**
 * Cria ou atualiza um lote da linha.
 *
 * A temperatura NÃO bloqueia: fora da faixa exigida, o lote é gravado com
 * motivo de divergência preenchido e o registro de quem aceitou. Travar aqui
 * faria a cozinha sem termômetro calibrado digitar um número plausível — pior
 * que a ausência, porque parece prova.
 */
export const upsertReceiptLotFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			lotId: z.uuid().optional(),
			receiptItemId: z.uuid(),
			lotCode: z.string().trim().min(1, "Informe o código do lote"),
			expiryDate: IsoDate.optional(),
			quantityBase: z.number().positive("Quantidade do lote precisa ser maior que zero"),
			unitCost: z.number().nonnegative().nullable().optional(),
			measuredTemperatureC: z.number().nullable().optional(),
			/** Confirmação explícita de aceite quando a temperatura sai da faixa. */
			acceptOutOfRange: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForLotItem(data.receiptItemId)
		const { userId } = await requireOpenReceipt(receiptId, 2)
		const inv = inventory()

		const { data: item } = await inv.from("goods_receipt_item").select("id, purchase_item_id, ingredient_id").eq("id", data.receiptItemId).single()
		if (!item) throw new Error("Item do recebimento não encontrado")

		const range = await requiredRangeFor(item.purchase_item_id ?? null, item.ingredient_id ?? null)
		const measured = data.measuredTemperatureC ?? null
		const verdict = temperatureVerdict(measured, range)
		const outOfRange = isTemperatureOutOfRange(verdict)

		if (outOfRange && !data.acceptOutOfRange) {
			throw new Error(`${temperatureDivergenceReason(measured as number, range)} Confirme o aceite para registrar mesmo assim.`)
		}

		const payload = {
			receipt_item_id: data.receiptItemId,
			lot_code: data.lotCode.trim(),
			expiry_date: data.expiryDate ?? null,
			quantity_base: data.quantityBase,
			unit_cost: data.unitCost ?? null,
			measured_temperature_c: measured,
			divergence_reason: outOfRange ? temperatureDivergenceReason(measured as number, range) : null,
			temperature_ack_by: outOfRange ? userId : null,
			temperature_ack_at: outOfRange ? new Date().toISOString() : null,
		}

		const query = data.lotId ? inv.from("goods_receipt_item_lot").update(payload).eq("id", data.lotId) : inv.from("goods_receipt_item_lot").insert(payload)
		const { error } = await query
		if (error) {
			if (error.code === "23505") throw new Error(`Lote "${data.lotCode}" já lançado nesta linha`)
			throw new Error(`Erro ao gravar lote: ${error.message}`)
		}
		return { verdict, outOfRange }
	})

export const deleteReceiptLotFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), receiptItemId: z.uuid() }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForLotItem(data.receiptItemId)
		await requireOpenReceipt(receiptId, 2)
		const { error } = await inventory().from("goods_receipt_item_lot").delete().eq("id", data.lotId).eq("receipt_item_id", data.receiptItemId)
		if (error) throw new Error(`Erro ao remover lote: ${error.message}`)
	})

/** Estágio 1: recebimento provisório (não movimenta estoque). */
export const setReceiptProvisionalFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: receipt } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(receipt.kitchen_id))
		const { error } = await inventory()
			.from("goods_receipt")
			.update({ status: "provisional", provisional_by: userId, provisional_at: new Date().toISOString() })
			.eq("id", data.receiptId)
			.eq("status", "draft")
		if (error) throw new Error(`Erro no recebimento provisório: ${error.message}`)
	})

/** Estágio 2: efetivação atômica (função SQL) — lotes + movimentos + OF. */
export const finalizeReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: receipt } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		const { data: result, error } = await inventory().rpc("finalize_goods_receipt", { p_receipt_id: data.receiptId, p_user: userId })
		if (error) throw new Error(`Efetivação falhou: ${error.message}`)
		return { movements: Number(result?.[0]?.movements ?? 0) }
	})

/** Lista recebimentos da cozinha. */
export const listReceiptsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: receipts, error } = await inventory()
			.from("goods_receipt")
			.select("id, nfe_document_id, supply_order_id, status, provisional_at, definitive_at, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar recebimentos: ${error.message}`)
		return receipts ?? []
	})

/** Detalhe do recebimento: itens + lotes + acondicionamento exigido (para conferência e termo). */
export const fetchReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const inv = inventory()
		const kit = getServerClient("kitchen") as unknown as LooseClient

		const { data: receipt, error } = await inv.from("goods_receipt").select("*").eq("id", data.receiptId).single()
		if (error || !receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		const { data: items } = await inv.from("goods_receipt_item").select("*").eq("receipt_id", data.receiptId)

		const itemRows = (items ?? []) as Array<Record<string, unknown>>
		const itemIds = itemRows.map((item) => item.id as string)
		const { data: lots } = itemIds.length > 0 ? await inv.from("goods_receipt_item_lot").select("*").in("receipt_item_id", itemIds) : { data: [] }
		const lotsByItem = new Map<string, Array<Record<string, unknown>>>()
		for (const lot of (lots ?? []) as Array<Record<string, unknown>>) {
			const key = lot.receipt_item_id as string
			const bucket = lotsByItem.get(key)
			if (bucket) bucket.push(lot)
			else lotsByItem.set(key, [lot])
		}

		const ingredientIds = [...new Set(itemRows.map((item) => item.ingredient_id).filter(Boolean))] as string[]
		const names = new Map<string, { description: string; measure_unit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ings } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			for (const ing of ings ?? []) names.set(ing.id, ing)
		}
		// GTINs vinculados aos itens (para a conferência por scanner)
		const skuIds = [...new Set(itemRows.map((item) => item.ingredient_item_id).filter(Boolean))] as string[]
		const gtinByItemId = new Map<string, string | null>()
		if (skuIds.length > 0) {
			const { data: skus } = await kit.from("ingredient_item").select("id, gtin").in("id", skuIds)
			for (const sku of skus ?? []) gtinByItemId.set(sku.id, sku.gtin)
		}

		// Acondicionamento exigido, por especificação de compra da linha.
		const purchaseItemIds = [...new Set(itemRows.map((item) => item.purchase_item_id).filter(Boolean))] as string[]
		const specById = new Map<string, Record<string, unknown>>()
		if (purchaseItemIds.length > 0) {
			const { data: specs } = await procurement()
				.from("purchase_item")
				.select(
					"id, conservation_class, storage_temp_min_c, storage_temp_max_c, package_type, package_net_content, package_net_content_unit, transport_requirement, min_shelf_life_days_on_delivery, delivery_conditioning"
				)
				.in("id", purchaseItemIds)
			for (const spec of (specs ?? []) as Array<Record<string, unknown>>) specById.set(spec.id as string, spec)
		}

		return {
			...receipt,
			items: itemRows.map((item) => ({
				...item,
				description: names.get(item.ingredient_id as string)?.description ?? "—",
				measure_unit: names.get(item.ingredient_id as string)?.measure_unit ?? null,
				gtin: item.ingredient_item_id ? (gtinByItemId.get(item.ingredient_item_id as string) ?? null) : null,
				conditioning: item.purchase_item_id ? (specById.get(item.purchase_item_id as string) ?? null) : null,
				lots: lotsByItem.get(item.id as string) ?? [],
			})),
		}
	})
