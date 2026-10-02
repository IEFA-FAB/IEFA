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

import {
	applyCorrectionFactors,
	calculateNetNeed,
	computeDispensaSum,
	type DirectContractLimitRow,
	type DispensaEntry,
	decideChannel,
	estimateLeadTime,
	fetchProcurementNeeds,
	fitsDispensaRoom,
	type PurchaseChannel,
	resolveDirectContractLimit,
	resolvePurchaseUnitId,
} from "@iefa/sisub-domain"
import { addCivilDays, brasiliaToday } from "@iefa/sisub-domain/civil-date"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { assertNoBlindCountHides } from "@/lib/blind-count.server"
import { getDb } from "@/lib/db.server"
import { currentFiscalYear } from "@/lib/expense-execution"
import { checkSupplierSicaf } from "@/lib/sicaf.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

/**
 * Quanto resta do limite da dispensa por valor (Lei 14.133/2021, art. 75, II) no exercício, por
 * ramo de atividade — a classe do PDM do CATMAT (IN SEGES/ME 67/2021, art. 4º, § 2º) —, para a
 * unidade gestora que compra pela cozinha (art. 75, § 1º). O limite vem da tabela
 * `procurement.direct_contract_limit`, não do código. Classe com dispensa sem valor fica `null`:
 * o total é um piso e a folga não se presume.
 */
async function loadDispensaRoomByClass(unitId: number | null, classCodes: readonly string[]): Promise<Map<string, number | null>> {
	const room = new Map<string, number | null>()
	if (unitId == null || classCodes.length === 0) return room
	const year = currentFiscalYear()
	const [{ data: limitRows, error: limitError }, { data: acquisitions, error: acqError }] = await Promise.all([
		procurement().from("direct_contract_limit").select("clause, valid_from, value, source_act"),
		procurement()
			.from("acquisition")
			.select("id, kind, direct_contract_clause, fiscal_year, activity_line, nd, estimated_value, deleted_at")
			.eq("unit_id", unitId)
			.eq("kind", "dispensa")
			.eq("fiscal_year", year)
			.is("deleted_at", null),
	])
	if (limitError || acqError) throw new Error(`Erro ao ler o somatório da dispensa: ${(limitError ?? acqError).message}`)
	const limits: DirectContractLimitRow[] = (limitRows ?? []).map((row: { clause: string; valid_from: string; value: number | string; source_act: string }) => ({
		clause: row.clause,
		validFrom: row.valid_from,
		value: Number(row.value),
		sourceAct: row.source_act,
	}))
	const acquisitionRows = (acquisitions ?? []) as Array<{
		id: string
		direct_contract_clause: string | null
		fiscal_year: number
		activity_line: string | null
		nd: string | null
		estimated_value: number | string | null
	}>
	// Valor de cada dispensa: o maior entre o empenhado vigente e o estimado.
	const committed = new Map<string, number>()
	if (acquisitionRows.length > 0) {
		const fin = getServerClient("finance") as unknown as LooseClient
		const { data: empenhos, error } = await fin
			.from("empenho")
			.select("id, acquisition_id")
			.in(
				"acquisition_id",
				acquisitionRows.map((a) => a.id)
			)
			.eq("status", "ativo")
		if (error) throw new Error(`Erro ao ler os empenhos das dispensas: ${error.message}`)
		const ids = (empenhos ?? []).map((e: { id: string }) => e.id)
		if (ids.length > 0) {
			const { data: vigentes, error: vigError } = await fin.from("v_empenho_vigente").select("empenho_id, valor_vigente").in("empenho_id", ids)
			if (vigError) throw new Error(`Erro ao ler o valor vigente das dispensas: ${vigError.message}`)
			const byEmpenho = new Map<string, number>(
				(vigentes ?? []).map((v: { empenho_id: string; valor_vigente: number | string }) => [v.empenho_id, Number(v.valor_vigente)])
			)
			for (const e of empenhos ?? []) committed.set(e.acquisition_id, (committed.get(e.acquisition_id) ?? 0) + (byEmpenho.get(e.id) ?? 0))
		}
	}
	const others: DispensaEntry[] = acquisitionRows.map((row) => ({
		id: row.id,
		label: row.id,
		kind: "dispensa",
		directContractClause: row.direct_contract_clause,
		fiscalYear: row.fiscal_year,
		activityLine: row.activity_line,
		nd: row.nd,
		estimatedValue: row.estimated_value == null ? null : Number(row.estimated_value),
		committedValue: committed.get(row.id) ?? 0,
	}))
	const limit = resolveDirectContractLimit(limits, "II", year)
	for (const code of new Set(classCodes)) {
		const sum = computeDispensaSum({
			candidate: {
				id: "__reposicao__",
				label: "reposição",
				kind: "dispensa",
				directContractClause: "II",
				fiscalYear: year,
				activityLine: code,
				nd: null,
				estimatedValue: 0,
				committedValue: 0,
			},
			others,
			limit,
		})
		room.set(code, sum && !sum.isFloor && sum.remaining != null ? sum.remaining : null)
	}
	return room
}

/** CATMAT → classe do PDM (ramo de atividade de bens). */
async function loadMaterialClassByCatmat(catmats: readonly number[]): Promise<Map<number, string>> {
	const byCatmat = new Map<number, string>()
	if (catmats.length === 0) return byCatmat
	const compras = getServerClient("compras_gov_integration") as unknown as LooseClient
	const { data: items, error } = await compras
		.from("compras_material_item")
		.select("codigo_item, codigo_pdm")
		.in("codigo_item", [...new Set(catmats)])
	if (error) throw new Error(`Erro ao ler o CATMAT: ${error.message}`)
	const pdms = [
		...new Set((items ?? []).map((row: { codigo_pdm: number | null }) => row.codigo_pdm).filter((pdm: number | null): pdm is number => pdm != null)),
	]
	if (pdms.length === 0) return byCatmat
	const { data: pdmRows, error: pdmError } = await compras.from("compras_material_pdm").select("codigo_pdm, codigo_classe").in("codigo_pdm", pdms)
	if (pdmError) throw new Error(`Erro ao ler o PDM: ${pdmError.message}`)
	const classByPdm = new Map<number, string>(
		(pdmRows ?? []).map((row: { codigo_pdm: number; codigo_classe: number }) => [row.codigo_pdm, String(row.codigo_classe)])
	)
	for (const row of items ?? []) {
		const code = row.codigo_pdm != null ? classByPdm.get(row.codigo_pdm) : undefined
		if (code) byCatmat.set(row.codigo_item, code)
	}
	return byCatmat
}

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
		// a sugestão é demanda − saldo: com o item em contagem cega, ela revela o saldo
		await assertNoBlindCountHides(data.kitchenId, ctx, "A reposição")
		const inv = inventory()
		const kit = kitchen()
		const proc = procurement()

		const today = brasiliaToday()
		const horizonEnd = addCivilDays(today, data.horizonDays)

		// (1) demanda bruta do horizonte (cardápios reais; fórmula compartilhada)
		const needs = await fetchProcurementNeeds(getDb(), ctx, { startDate: today, endDate: horizonEnd, kitchenId: data.kitchenId })
		if (needs.length === 0) return []
		const ingredientIds = needs.map((n) => n.ingredient_id)

		// (2) FC/IR do ingrediente (herança receita→ingrediente fica no anexo quantitativo; aqui é reposição)
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
		const catmatCodeByIngredient = new Map<string, number>()
		{
			const { data: links } = await proc
				.from("purchase_item_ingredient")
				.select("ingredient_id, purchase_item_id, conversion_factor, is_default, purchase_item:purchase_item_id (catmat_item_codigo, unit_price)")
				.in("ingredient_id", ingredientIds)
				.eq("is_default", true)
			for (const link of links ?? []) {
				catmatByIngredient.set(link.ingredient_id, link.purchase_item?.catmat_item_codigo != null)
				if (link.purchase_item?.catmat_item_codigo != null) catmatCodeByIngredient.set(link.ingredient_id, Number(link.purchase_item.catmat_item_codigo))
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

		// (5) saldo oficial de ARP própria vigente (via item do anexo → ingrediente)
		const arpBalanceById = new Map<string, number>()
		const expectedSupplierByIngredient = new Map<string, string>()
		{
			const { data: arpItems } = await proc
				.from("arp_item")
				.select("saldo_empenho, ni_fornecedor, quantity_estimate_item:quantity_estimate_item_id (ingredient_id), arp:arp_id (data_vigencia_fim)")
				.not("quantity_estimate_item_id", "is", null)
			for (const item of arpItems ?? []) {
				const ingredientId = item.quantity_estimate_item?.ingredient_id
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

		// (7) somatório da dispensa por ramo (classe do CATMAT) na unidade gestora que compra pela cozinha
		const { data: kitchenRow, error: kitchenError } = await kit.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).maybeSingle()
		if (kitchenError) throw new Error(`Erro ao ler a cozinha: ${kitchenError.message}`)
		const purchaseUnitId = resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null })
		const classByCatmat = await loadMaterialClassByCatmat([...catmatCodeByIngredient.values()])
		const dispensaRoom = await loadDispensaRoomByClass(purchaseUnitId, [...classByCatmat.values()])

		return needs
			.map((need) => {
				const factors = factorsById.get(need.ingredient_id) as { correction_factor: number | null; rehydration_index: number | null } | undefined
				const grossDemand = applyCorrectionFactors(need.estimated_quantity, {
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
				// O valor tem de caber no que RESTA do limite no ramo do item — o somatório do exercício,
				// não o item sozinho (art. 75, § 1º). A folga consumida por uma sugestão desconta das
				// seguintes do mesmo ramo; sem classe ou com dispensa sem valor, não se presume folga.
				const catmat = catmatCodeByIngredient.get(need.ingredient_id)
				const lineCode = catmat != null ? classByCatmat.get(catmat) : undefined
				const remaining = lineCode ? (dispensaRoom.get(lineCode) ?? null) : null
				const smallValue = fitsDispensaRoom(estimatedValue, remaining)
				if (smallValue && lineCode && remaining != null && estimatedValue != null) dispensaRoom.set(lineCode, remaining - estimatedValue)
				const decision = decideChannel({
					netNeed,
					ownArpBalance: arpBalanceById.get(need.ingredient_id) ?? 0,
					// carona não é pesquisada automaticamente (custo de API por item);
					// a busca manual de ARP externa fica na tela de anexos quantitativos
					caronaAvailable: null,
					hasCatmat: catmatByIngredient.get(need.ingredient_id) ?? false,
					coverageDays,
					urgencyThresholdDays: policy?.urgency_threshold_days ?? leadTime.days,
					smallValue,
					dispensaRemaining: remaining,
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
					calcMemory: `bruta ${need.estimated_quantity} × FC ${factors?.correction_factor ?? 1} ÷ IR ${factors?.rehydration_index ?? 1} = ${grossDemand}${minStock > 0 ? ` + mínimo ${minStock}` : ""}; − estoque ${stock.available.toFixed(2)} (excl. ${stock.expiring.toFixed(2)} vencendo) − trânsito ${inTransit} = ${netNeed}`,
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
