/**
 * @module supply-order.fn
 * Ordem de Fornecimento (Fase 4): distribui um empenho da unidade para entrega
 * numa cozinha, com data prevista (insumo do lead time). Emissão valida saldo
 * do empenho via constraint trigger no banco.
 * CLIENT: getServerClient (service role, schemas procurement/finance).
 * AUTH: `storage` nível 2.
 * TABLES: procurement.supply_order(_item), finance.empenho (leitura).
 * @domain kitchen
 * @migration 20260729170000_procurement_supply_order_goods_receipt
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { checkSupplierSicaf } from "@/lib/sicaf.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const procurement = () => getServerClient("procurement") as unknown as LooseClient

/** OFs de uma cozinha, com itens e dados do empenho. */
export const listSupplyOrdersFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const proc = procurement()

		const { data: orders, error } = await proc
			.from("supply_order")
			.select("id, empenho_id, number, sent_at, expected_delivery, status, sicaf_status, notes, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar OFs: ${error.message}`)
		const list = orders ?? []
		if (list.length === 0) return []

		const { data: items } = await proc
			.from("supply_order_item")
			.select("id, supply_order_id, arp_item_id, purchase_item_id, ordered_qty, unit_price")
			.in(
				"supply_order_id",
				list.map((o: { id: string }) => o.id)
			)

		const empenhoIds = [...new Set(list.map((o: { empenho_id: string }) => o.empenho_id))]
		const { data: empenhos } = await (getServerClient("finance") as unknown as LooseClient)
			.from("empenho")
			.select("id, numero_empenho, quantidade_empenhada")
			.in("id", empenhoIds)
		const empenhoById = new Map((empenhos ?? []).map((e: { id: string }) => [e.id, e]))

		return list.map((order: { id: string; empenho_id: string }) => ({
			...order,
			empenho: empenhoById.get(order.empenho_id) ?? null,
			items: (items ?? []).filter((item: { supply_order_id: string }) => item.supply_order_id === order.id),
		}))
	})

/** Emite uma OF contra um empenho. O trigger do banco garante soma ≤ empenhado. */
export const createSupplyOrderFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			empenhoId: z.uuid(),
			kitchenId: z.number().int().positive(),
			number: z.string().optional(),
			expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			items: z
				.array(
					z.object({
						arpItemId: z.uuid().optional(),
						purchaseItemId: z.uuid().optional(),
						orderedQty: z.number().positive(),
						unitPrice: z.number().nonnegative().optional(),
					})
				)
				.min(1),
			sicafStatus: z.string().optional(),
			sicafAcknowledged: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const proc = procurement()

		// SICAF SERVER-SIDE (review: evidência vinda do cliente podia ser de
		// outro fornecedor/defasada): o CNPJ vem do fornecedor do EMPENHO
		// (arp_item.ni_fornecedor) e a consulta acontece aqui, na emissão.
		let sicafStatus: string | null = null
		const finance = getServerClient("finance") as unknown as LooseClient
		const { data: empenhoRow } = await finance.from("empenho").select("arp_item_id, unit_id").eq("id", data.empenhoId).single()
		if (!empenhoRow) throw new Error("Empenho não encontrado")
		if (empenhoRow.arp_item_id != null) {
			const { data: arpItem } = await proc.from("procurement_arp_item").select("ni_fornecedor").eq("id", empenhoRow.arp_item_id).maybeSingle()
			const cnpj = arpItem?.ni_fornecedor?.replace(/\D/g, "") ?? ""
			if (cnpj.length === 14) {
				const sicaf = await checkSupplierSicaf(cnpj)
				sicafStatus = `${sicaf.status}: ${sicaf.detail} (CNPJ ${cnpj}, verificado na emissão)`
				if (sicaf.status !== "regular" && !data.sicafAcknowledged) {
					throw new Error(`Fornecedor ${cnpj} com situação "${sicaf.detail}" no SICAF — confirme explicitamente para emitir mesmo assim`)
				}
			}
		}

		const { data: order, error } = await proc
			.from("supply_order")
			.insert({
				empenho_id: data.empenhoId,
				kitchen_id: data.kitchenId,
				number: data.number?.trim() || null,
				sent_at: new Date().toISOString().substring(0, 10),
				expected_delivery: data.expectedDelivery,
				status: "sent",
				sicaf_status: sicafStatus,
				sicaf_ack_by: data.sicafAcknowledged ? userId : null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !order) throw new Error(`Erro ao emitir OF: ${error?.message}`)

		const { error: itemsError } = await proc.from("supply_order_item").insert(
			data.items.map((item) => ({
				supply_order_id: order.id,
				arp_item_id: item.arpItemId ?? null,
				purchase_item_id: item.purchaseItemId ?? null,
				ordered_qty: item.orderedQty,
				unit_price: item.unitPrice ?? null,
			}))
		)
		if (itemsError) {
			await proc.from("supply_order").delete().eq("id", order.id)
			throw new Error(itemsError.message.includes("excede") ? itemsError.message : `Erro nos itens da OF: ${itemsError.message}`)
		}
		return { supplyOrderId: order.id as string }
	})

/** Empenhos ativos da unidade da cozinha (para emitir OF). */
export const listEmpenhosForKitchenFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const kitchenDb = getServerClient("kitchen") as unknown as LooseClient
		const finance = getServerClient("finance") as unknown as LooseClient

		const { data: kitchenRow } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).single()
		const unitId = kitchenRow?.purchase_unit_id ?? kitchenRow?.unit_id
		if (unitId == null) return []

		const { data: empenhos, error } = await finance
			.from("empenho")
			.select("id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, arp_item_id")
			.eq("unit_id", unitId)
			.eq("status", "ativo")
			.order("data_empenho", { ascending: false })
			.limit(100)
		if (error) throw new Error(`Erro ao listar empenhos: ${error.message}`)
		const list = empenhos ?? []

		// fornecedor vem da ARP — query separada: embed cross-schema
		// (finance → procurement) não resolve no PostgREST (pego pelo E2E)
		const arpItemIds = [...new Set(list.map((e: { arp_item_id: string | null }) => e.arp_item_id).filter(Boolean))]
		const supplierByArpItem = new Map<string, { ni_fornecedor: string | null; nome_fornecedor: string | null }>()
		if (arpItemIds.length > 0) {
			const { data: arpItems } = await procurement().from("procurement_arp_item").select("id, ni_fornecedor, nome_fornecedor").in("id", arpItemIds)
			for (const item of arpItems ?? []) supplierByArpItem.set(item.id, item)
		}
		return list.map((e: { arp_item_id: string | null }) => ({ ...e, arp_item: e.arp_item_id ? (supplierByArpItem.get(e.arp_item_id) ?? null) : null }))
	})

export const cancelSupplyOrderFn = createServerFn({ method: "POST" })
	.validator(z.object({ supplyOrderId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: order } = await procurement().from("supply_order").select("kitchen_id").eq("id", data.supplyOrderId).maybeSingle()
		if (!order) throw new Error("OF não encontrada")
		await requireStorageForKitchen(2, Number(order.kitchen_id))
		const { error } = await procurement()
			.from("supply_order")
			.update({ status: "cancelled", updated_at: new Date().toISOString() })
			.eq("id", data.supplyOrderId)
			.in("status", ["draft", "sent"])
		if (error) throw new Error(`Erro ao cancelar OF: ${error.message}`)
	})
