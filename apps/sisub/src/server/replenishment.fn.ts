/**
 * @module replenishment.fn
 * MRP + roteamento de canal (Fase 7): necessidade líquida (bruta × FC ÷ IR −
 * estoque válido − trânsito), lead time observado com fallback e recomendação
 * de canal (ARP própria → carona → Supermercado Virtual → Contrata+ →
 * licitação). Recomenda — a emissão é humana. Checagem SICAF pré-OF via
 * dadosabertos.compras.gov.br (mesmo padrão do searchArpFn).
 * CLIENT: getServerClient + getDb (demanda bruta reusa fetchProcurementNeeds).
 * AUTH: `storage` nível 1 (leitura/sugestão).
 * @domain kitchen
 * @migration 20260729190000_inventory_stock_policy
 */

import { applyCorrectionFactors, calculateNetNeed, decideChannel, estimateLeadTime, fetchProcurementNeeds, type PurchaseChannel } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { checkSupplierSicaf } from "@/lib/sicaf.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

/** Teto de dispensa por valor (art. 75, I/II, Lei 14.133) — atualizado por decreto; ajustar quando o índice anual sair. */
const SMALL_VALUE_DISPENSA_LIMIT = 59_906.02

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient
const procurement = () => getServerClient("procurement") as unknown as LooseClient

export interface ReplenishmentSuggestion {
	ingredientId: string
	description: string
	measureUnit: string | null
	grossDemand: number
	availableStock: number
	expiringExcluded: number
	inTransit: number
	netNeed: number
	coverageDays: number
	leadTime: { days: number; source: string }
	channel: PurchaseChannel
	reason: string
	calcMemory: string
}

/** Sugestões de reposição para o horizonte (default 14 dias), com memória de cálculo. */
export const fetchReplenishmentSuggestionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), horizonDays: z.number().int().min(1).max(60).default(14) }))
	.handler(async ({ data }): Promise<ReplenishmentSuggestion[]> => {
		const ctx = await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const kit = kitchen()
		const proc = procurement()

		const today = new Date().toISOString().substring(0, 10)
		const horizonEnd = new Date(Date.now() + data.horizonDays * 86_400_000).toISOString().substring(0, 10)

		// (1) demanda bruta do horizonte (cardápios reais; fórmula compartilhada)
		const needs = await fetchProcurementNeeds(getDb(), ctx, { startDate: today, endDate: horizonEnd, kitchenId: data.kitchenId })
		if (needs.length === 0) return []
		const ingredientIds = needs.map((n) => n.ingredient_id)

		// (2) FC/IR do ingrediente (herança receita→ingrediente fica na ATA; aqui é reposição)
		const { data: ingredients } = await kit.from("ingredient").select("id, correction_factor, rehydration_index").in("id", ingredientIds)
		const factorsById = new Map((ingredients ?? []).map((i: { id: string }) => [i.id, i]))

		// (3) estoque disponível, excluindo lotes que vencem dentro do horizonte (sinalizados)
		const { data: balances } = await inv
			.from("v_stock_balance")
			.select("ingredient_id, balance, expiry_date")
			.eq("kitchen_id", data.kitchenId)
			.in("ingredient_id", ingredientIds)
		const stockById = new Map<string, { available: number; expiring: number }>()
		for (const row of balances ?? []) {
			const entry = stockById.get(row.ingredient_id) ?? { available: 0, expiring: 0 }
			const qty = Number(row.balance)
			if (qty <= 0) continue
			if (row.expiry_date != null && row.expiry_date <= horizonEnd) entry.expiring += qty
			else entry.available += qty
			stockById.set(row.ingredient_id, entry)
		}

		// (4) em trânsito: OFs enviadas/parciais → purchase_item → ingrediente (conversão default)
		const { data: transitOrders } = await proc
			.from("supply_order")
			.select("id, supply_order_item (purchase_item_id, ordered_qty)")
			.eq("kitchen_id", data.kitchenId)
			.in("status", ["sent", "partially_received"])
		const purchaseQty = new Map<string, number>()
		for (const order of transitOrders ?? []) {
			for (const item of order.supply_order_item ?? []) {
				if (!item.purchase_item_id) continue
				purchaseQty.set(item.purchase_item_id, (purchaseQty.get(item.purchase_item_id) ?? 0) + Number(item.ordered_qty))
			}
		}
		// OF parcialmente recebida: o que já entrou em definitivo sai do trânsito
		// (review: trânsito superestimado suprimia sugestões necessárias)
		const receivedByIngredient = new Map<string, number>()
		const transitOrderIds = (transitOrders ?? []).map((o: { id: string }) => o.id)
		if (transitOrderIds.length > 0) {
			const { data: receipts } = await inv
				.from("goods_receipt")
				.select("id, supply_order_id")
				.in("supply_order_id", transitOrderIds)
				.not("definitive_at", "is", null)
			const receiptIds = (receipts ?? []).map((r: { id: string }) => r.id)
			if (receiptIds.length > 0) {
				const { data: receiptItems } = await inv.from("goods_receipt_item").select("receipt_id, ingredient_id, received_qty_base").in("receipt_id", receiptIds)
				for (const item of receiptItems ?? []) {
					if (!item.ingredient_id) continue
					receivedByIngredient.set(item.ingredient_id, (receivedByIngredient.get(item.ingredient_id) ?? 0) + Number(item.received_qty_base))
				}
			}
		}
		const transitById = new Map<string, number>()
		const defaultPurchaseByIngredient = new Map<string, string>()
		const priceByIngredient = new Map<string, { unitPrice: number | null; conversionFactor: number }>()
		const purchaseItemIds = [...purchaseQty.keys()]
		const catmatByIngredient = new Map<string, boolean>()
		{
			const { data: links } = await proc
				.from("purchase_item_ingredient")
				.select("ingredient_id, purchase_item_id, conversion_factor, is_default, purchase_item:purchase_item_id (catmat_item_codigo, unit_price)")
				.in("ingredient_id", ingredientIds)
				.eq("is_default", true)
			for (const link of links ?? []) {
				catmatByIngredient.set(link.ingredient_id, link.purchase_item?.catmat_item_codigo != null)
				defaultPurchaseByIngredient.set(link.ingredient_id, link.purchase_item_id)
				priceByIngredient.set(link.ingredient_id, {
					unitPrice: link.purchase_item?.unit_price != null ? Number(link.purchase_item.unit_price) : null,
					conversionFactor: Number(link.conversion_factor ?? 1) || 1,
				})
			}
		}
		// conversão do trânsito por PURCHASE_ITEM da OF — sem exigir is_default
		// (review: OF de item não-default ficava fora do trânsito). Um link por
		// purchase_item, preferindo o default.
		if (purchaseItemIds.length > 0) {
			const { data: transitLinks } = await proc
				.from("purchase_item_ingredient")
				.select("ingredient_id, purchase_item_id, conversion_factor, is_default")
				.in("purchase_item_id", purchaseItemIds)
				.order("is_default", { ascending: false })
			const seen = new Set<string>()
			for (const link of transitLinks ?? []) {
				if (seen.has(link.purchase_item_id)) continue
				seen.add(link.purchase_item_id)
				if (!ingredientIds.includes(link.ingredient_id)) continue
				const qty = (purchaseQty.get(link.purchase_item_id) ?? 0) * (Number(link.conversion_factor ?? 1) || 1)
				transitById.set(link.ingredient_id, (transitById.get(link.ingredient_id) ?? 0) + qty)
			}
		}
		for (const [ingredientId, received] of receivedByIngredient) {
			transitById.set(ingredientId, Math.max(0, (transitById.get(ingredientId) ?? 0) - received))
		}

		// (5) saldo oficial de ARP própria vigente (via ata_item → ingrediente)
		const arpBalanceById = new Map<string, number>()
		const expectedSupplierByIngredient = new Map<string, string>()
		{
			const { data: arpItems } = await proc
				.from("procurement_arp_item")
				.select("saldo_empenho, ni_fornecedor, ata_item:ata_item_id (ingredient_id), arp:arp_id (data_vigencia_fim)")
				.not("ata_item_id", "is", null)
			for (const item of arpItems ?? []) {
				const ingredientId = item.ata_item?.ingredient_id
				if (!ingredientId || !ingredientIds.includes(ingredientId)) continue
				if (item.arp?.data_vigencia_fim != null && item.arp.data_vigencia_fim < today) continue
				arpBalanceById.set(ingredientId, (arpBalanceById.get(ingredientId) ?? 0) + Number(item.saldo_empenho ?? 0))
				if (item.ni_fornecedor != null) expectedSupplierByIngredient.set(ingredientId, String(item.ni_fornecedor))
			}
		}

		// (6) política + lead time observado
		const { data: policies } = await inv.from("stock_policy").select("*").eq("kitchen_id", data.kitchenId).in("ingredient_id", ingredientIds)
		const policyById = new Map((policies ?? []).map((p: { ingredient_id: string }) => [p.ingredient_id, p]))
		const { data: leadTimes } = await inv.from("v_supplier_lead_time").select("purchase_item_id, ni_fornecedor, lead_time_days").limit(1000)
		// por item de compra — mediana global misturava fornecedores/itens sem
		// relação (review) e contaminava a recomendação de canal
		const observedByPurchaseItem = new Map<string, number[]>()
		for (const row of leadTimes ?? []) {
			if (row.purchase_item_id == null || !Number.isFinite(Number(row.lead_time_days))) continue
			// chave composta fornecedor:item; fallback só-item quando o fornecedor
			// esperado é desconhecido (review: mediana misturava fornecedores)
			for (const key of [row.ni_fornecedor != null ? `${row.ni_fornecedor}:${row.purchase_item_id}` : null, row.purchase_item_id].filter(Boolean) as string[]) {
				const list = observedByPurchaseItem.get(key) ?? []
				list.push(Number(row.lead_time_days))
				observedByPurchaseItem.set(key, list)
			}
		}

		return needs
			.map((need) => {
				const factors = factorsById.get(need.ingredient_id) as { correction_factor: number | null; rehydration_index: number | null } | undefined
				const grossDemand = applyCorrectionFactors(need.total_quantity, {
					correctionFactor: factors?.correction_factor != null ? Number(factors.correction_factor) : null,
					rehydrationIndex: factors?.rehydration_index != null ? Number(factors.rehydration_index) : null,
				})
				const stock = stockById.get(need.ingredient_id) ?? { available: 0, expiring: 0 }
				const inTransit = Number((transitById.get(need.ingredient_id) ?? 0).toFixed(4))
				// estoque mínimo da política entra na demanda: a sugestão precisa
				// recompor a reserva, não só cobrir o horizonte (review)
				const minStock = Number((policyById.get(need.ingredient_id) as { min_stock?: number } | undefined)?.min_stock ?? 0)
				const netNeed = calculateNetNeed({ grossDemand: grossDemand + minStock, availableStock: stock.available, inTransit })

				const policy = policyById.get(need.ingredient_id) as { coverage_days?: number; urgency_threshold_days?: number | null; min_stock?: number } | undefined
				const dailyDemand = grossDemand / data.horizonDays
				const coverageDays = dailyDemand > 0 ? Math.floor(stock.available / dailyDemand) : data.horizonDays
				const defaultPurchaseId = defaultPurchaseByIngredient.get(need.ingredient_id)
				// prefere o histórico do FORNECEDOR esperado (ARP vigente) para o item;
				// sem fornecedor conhecido, cai no histórico do item (todos fornecedores)
				const expectedSupplier = expectedSupplierByIngredient.get(need.ingredient_id)
				const observedDays =
					defaultPurchaseId == null
						? []
						: ((expectedSupplier != null ? observedByPurchaseItem.get(`${expectedSupplier}:${defaultPurchaseId}`) : undefined) ??
							observedByPurchaseItem.get(defaultPurchaseId) ??
							[])
				const leadTime = estimateLeadTime(observedDays, null, policy?.coverage_days ?? 7)
				// valor estimado ≈ (necessidade ÷ fator de conversão) × preço unitário
				// do item de compra; limite de dispensa por valor (art. 75, I/II da
				// Lei 14.133 — teto atualizado por decreto) habilita o Contrata+
				// (review: canal ficava permanentemente inalcançável)
				const price = priceByIngredient.get(need.ingredient_id)
				const estimatedValue = price?.unitPrice != null ? (netNeed / price.conversionFactor) * price.unitPrice : null
				const decision = decideChannel({
					netNeed,
					ownArpBalance: arpBalanceById.get(need.ingredient_id) ?? 0,
					// carona não é pesquisada automaticamente (custo de API por item);
					// a busca manual de ARP externa fica na tela de ATAs
					caronaAvailable: null,
					hasCatmat: catmatByIngredient.get(need.ingredient_id) ?? false,
					coverageDays,
					urgencyThresholdDays: policy?.urgency_threshold_days ?? leadTime.days,
					smallValue: estimatedValue != null && estimatedValue > 0 && estimatedValue <= SMALL_VALUE_DISPENSA_LIMIT,
				})

				return {
					ingredientId: need.ingredient_id,
					description: need.ingredient_name,
					measureUnit: need.measure_unit,
					grossDemand,
					availableStock: Number(stock.available.toFixed(4)),
					expiringExcluded: Number(stock.expiring.toFixed(4)),
					inTransit,
					netNeed,
					coverageDays,
					leadTime,
					channel: decision.channel,
					reason: decision.reason,
					calcMemory: `bruta ${need.total_quantity} × FC ${factors?.correction_factor ?? 1} ÷ IR ${factors?.rehydration_index ?? 1} = ${grossDemand}${minStock > 0 ? ` + mínimo ${minStock}` : ""}; − estoque ${stock.available.toFixed(2)} (excl. ${stock.expiring.toFixed(2)} vencendo) − trânsito ${inTransit} = ${netNeed}`,
				}
			})
			.filter((s) => s.netNeed > 0 || s.expiringExcluded > 0)
			.sort((a, b) => b.netNeed - a.netNeed)
	})

/**
 * Situação do fornecedor no SICAF (dadosabertos.compras.gov.br). Falha da API
 * não bloqueia — retorna estado indeterminado; o gestor decide com registro.
 */
export const checkSupplierSicafFn = createServerFn({ method: "GET" })
	.validator(z.object({ cnpj: z.string().regex(/^\d{14}$/) }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		return checkSupplierSicaf(data.cnpj)
	})
