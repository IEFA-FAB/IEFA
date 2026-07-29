/**
 * @module receiving.fn
 * Recebimento físico em dois estágios (Lei 14.133, art. 140): draft →
 * provisional → definitive/divergent. Só a efetivação do definitivo (função
 * SQL atômica) cria lotes + movimentos e atualiza o status da OF.
 * Itens nascem dos nfe_item já correlacionados; lote/validade pré-preenchidos
 * do grupo rastro; o scanner de GTIN confere item da nota × produto físico.
 * CLIENT: getServerClient (service role, schemas inventory/kitchen).
 * AUTH: `storage` nível 2 (provisório), nível 3 (definitivo).
 * @domain kitchen
 * @migration 20260729170000_procurement_supply_order_goods_receipt
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient

/**
 * Cria o recebimento a partir de uma NF-e conferida: um goods_receipt_item por
 * nfe_item resolvido (matched/review com ingredient), com quantidade faturada
 * como ponto de partida e lote/validade do rastro quando houver.
 */
export const createReceiptFromNfeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			nfeDocumentId: z.string().uuid(),
			supplyOrderId: z.string().uuid().optional(),
			empenhoId: z.string().uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()

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
		if (error || !receipt) throw new Error(`Erro ao criar recebimento: ${error?.message}`)

		const rows = resolvable.map(
			(item: {
				id: string
				ingredient_id: string
				ingredient_item_id: string | null
				purchase_item_id: string | null
				matched_qty_base: number | null
				unit_price: number | null
				commercial_qty: number | null
				lot_code: string | null
				expiry_date: string | null
			}) => {
				const invoiced = item.matched_qty_base
				// custo unitário na base: valor total do item / quantidade base
				const totalValue = item.unit_price != null && item.commercial_qty != null ? item.unit_price * item.commercial_qty : null
				const unitCostBase = totalValue != null && invoiced != null && invoiced > 0 ? Number((totalValue / invoiced).toFixed(4)) : null
				return {
					receipt_id: receipt.id,
					nfe_item_id: item.id,
					ingredient_id: item.ingredient_id,
					frozen_preparation_id: null,
					ingredient_item_id: item.ingredient_item_id,
					purchase_item_id: item.purchase_item_id,
					invoiced_qty_base: invoiced,
					received_qty_base: invoiced ?? 0,
					lot_code: item.lot_code,
					expiry_date: item.expiry_date,
					unit_cost: unitCostBase,
				}
			}
		)
		const { error: insertError } = await inv.from("goods_receipt_item").insert(rows)
		if (insertError) {
			await inv.from("goods_receipt").delete().eq("id", receipt.id)
			throw new Error(`Erro ao criar itens do recebimento: ${insertError.message}`)
		}
		return { receiptId: receipt.id as string, itemsCount: rows.length, skipped: (items ?? []).length - rows.length }
	})

/** Conferência: quantidade física + lote/validade + motivo de divergência por item. */
export const updateReceiptItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptItemId: z.string().uuid(),
			receivedQtyBase: z.number().nonnegative(),
			lotCode: z.string().optional(),
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.nullable()
				.optional(),
			divergenceReason: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 2)
		const inv = inventory()

		const { data: item } = await inv.from("goods_receipt_item").select("id, invoiced_qty_base, receipt_id").eq("id", data.receiptItemId).single()
		if (!item) throw new Error("Item do recebimento não encontrado")
		const { data: receipt } = await inv.from("goods_receipt").select("status, kitchen_id").eq("id", item.receipt_id).single()
		if (!receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(2, Number(receipt.kitchen_id))
		if (receipt.status === "definitive") throw new Error("Recebimento já efetivado — não pode ser alterado")

		const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
		const diverges = invoiced != null && data.receivedQtyBase !== invoiced
		if (diverges && !data.divergenceReason?.trim()) {
			throw new Error("Quantidade física difere da faturada — informe o motivo da divergência")
		}

		const { error } = await inv
			.from("goods_receipt_item")
			.update({
				received_qty_base: data.receivedQtyBase,
				lot_code: data.lotCode?.trim() || null,
				expiry_date: data.expiryDate ?? null,
				divergence_reason: diverges ? (data.divergenceReason?.trim() ?? null) : null,
			})
			.eq("id", data.receiptItemId)
		if (error) throw new Error(`Erro ao atualizar item: ${error.message}`)
	})

/** Estágio 1: recebimento provisório (não movimenta estoque). */
export const setReceiptProvisionalFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.string().uuid() }))
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
	.validator(z.object({ receiptId: z.string().uuid() }))
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

/** Detalhe do recebimento com itens + descrições (para conferência e termo). */
export const fetchReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const inv = inventory()
		const kit = getServerClient("kitchen") as unknown as LooseClient

		const { data: receipt, error } = await inv.from("goods_receipt").select("*").eq("id", data.receiptId).single()
		if (error || !receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		const { data: items } = await inv.from("goods_receipt_item").select("*").eq("receipt_id", data.receiptId)

		const ingredientIds = [...new Set((items ?? []).map((i: { ingredient_id: string | null }) => i.ingredient_id).filter(Boolean))] as string[]
		const names = new Map<string, { description: string; measure_unit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ings } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			for (const ing of ings ?? []) names.set(ing.id, ing)
		}
		// GTINs vinculados aos itens (para a conferência por scanner)
		const itemIds = [...new Set((items ?? []).map((i: { ingredient_item_id: string | null }) => i.ingredient_item_id).filter(Boolean))] as string[]
		const gtinByItemId = new Map<string, string | null>()
		if (itemIds.length > 0) {
			const { data: skus } = await kit.from("ingredient_item").select("id, gtin").in("id", itemIds)
			for (const sku of skus ?? []) gtinByItemId.set(sku.id, sku.gtin)
		}

		return {
			...receipt,
			items: (items ?? []).map((item: Record<string, unknown>) => ({
				...item,
				description: names.get(item.ingredient_id as string)?.description ?? "—",
				measure_unit: names.get(item.ingredient_id as string)?.measure_unit ?? null,
				gtin: item.ingredient_item_id ? (gtinByItemId.get(item.ingredient_item_id as string) ?? null) : null,
			})),
		}
	})
