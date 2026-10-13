/**
 * Montagem pura da sugestão de reposição (`fetchReplenishmentSuggestionsFn`): índices sobre as
 * leituras do banco e a sugestão por insumo. As regras (FC/IR, necessidade líquida, lead time,
 * canal) são do `@iefa/sisub-domain`; aqui fica o que a server fn fazia em volta delas.
 *
 * Fora de `replenishment.fn.ts` porque teste unitário não pode importar `@/server/*`.
 */

import { applyCorrectionFactors, calculateNetNeed, decideChannel, estimateLeadTime, fitsDispensaRoom, type PurchaseChannel } from "@iefa/sisub-domain"

type Numeric = number | string | null

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

// ─── Índices sobre as leituras ───────────────────────────────────────────────

export interface StockEntry {
	available: number
	expiring: number
}

/** Saldo positivo por insumo; lote que vence dentro do horizonte não conta como disponível. */
export function indexStockByIngredient(
	balances: ReadonlyArray<{ ingredient_id: string | null; balance: Numeric; expiry_date: string | null }>,
	horizonEnd: string
): Map<string, StockEntry> {
	const stockById = new Map<string, StockEntry>()
	for (const row of balances) {
		if (row.ingredient_id == null) continue // filtrado no `.in()`; coluna de view sai nulável
		const entry = stockById.get(row.ingredient_id) ?? { available: 0, expiring: 0 }
		const qty = Number(row.balance)
		if (qty <= 0) continue
		if (row.expiry_date != null && row.expiry_date <= horizonEnd) entry.expiring += qty
		else entry.available += qty
		stockById.set(row.ingredient_id, entry)
	}
	return stockById
}

/** Quantidade pedida nas OFs em trânsito, por item de compra. */
export function sumOrderedQtyByPurchaseItem(
	transitOrders: ReadonlyArray<{ supply_order_item: ReadonlyArray<{ purchase_item_id: string | null; ordered_qty: Numeric }> | null }>
): Map<string, number> {
	const purchaseQty = new Map<string, number>()
	for (const order of transitOrders) {
		for (const item of order.supply_order_item ?? []) {
			if (!item.purchase_item_id) continue
			purchaseQty.set(item.purchase_item_id, (purchaseQty.get(item.purchase_item_id) ?? 0) + Number(item.ordered_qty))
		}
	}
	return purchaseQty
}

export interface DefaultPurchaseIndex {
	defaultPurchaseByIngredient: Map<string, string>
	priceByIngredient: Map<string, { unitPrice: number | null; conversionFactor: number }>
	catmatByIngredient: Map<string, boolean>
	catmatCodeByIngredient: Map<string, number>
}

/** Item de compra padrão de cada insumo: preço, fator de conversão e CATMAT. */
export function indexDefaultPurchaseLinks(
	links: ReadonlyArray<{
		ingredient_id: string
		purchase_item_id: string
		conversion_factor: Numeric
		purchase_item: { catmat_item_codigo: Numeric; unit_price: Numeric } | null
	}>
): DefaultPurchaseIndex {
	const defaultPurchaseByIngredient = new Map<string, string>()
	const priceByIngredient = new Map<string, { unitPrice: number | null; conversionFactor: number }>()
	const catmatByIngredient = new Map<string, boolean>()
	const catmatCodeByIngredient = new Map<string, number>()
	for (const link of links) {
		catmatByIngredient.set(link.ingredient_id, link.purchase_item?.catmat_item_codigo != null)
		if (link.purchase_item?.catmat_item_codigo != null) catmatCodeByIngredient.set(link.ingredient_id, Number(link.purchase_item.catmat_item_codigo))
		defaultPurchaseByIngredient.set(link.ingredient_id, link.purchase_item_id)
		priceByIngredient.set(link.ingredient_id, {
			unitPrice: link.purchase_item?.unit_price != null ? Number(link.purchase_item.unit_price) : null,
			conversionFactor: Number(link.conversion_factor ?? 1) || 1,
		})
	}
	return { defaultPurchaseByIngredient, priceByIngredient, catmatByIngredient, catmatCodeByIngredient }
}

/** O que já entrou em definitivo das OFs em trânsito, por insumo. */
export function sumReceivedByIngredient(receiptItems: ReadonlyArray<{ ingredient_id: string | null; received_qty_base: Numeric }>): Map<string, number> {
	const receivedByIngredient = new Map<string, number>()
	for (const item of receiptItems) {
		if (!item.ingredient_id) continue
		receivedByIngredient.set(item.ingredient_id, (receivedByIngredient.get(item.ingredient_id) ?? 0) + Number(item.received_qty_base))
	}
	return receivedByIngredient
}

/**
 * Trânsito por insumo: um link por item de compra (o primeiro da lista, que vem com o default na
 * frente), convertido pelo fator do link, menos o já recebido (nunca abaixo de zero).
 */
export function computeTransitByIngredient(input: {
	transitLinks: ReadonlyArray<{ ingredient_id: string; purchase_item_id: string; conversion_factor: Numeric }>
	purchaseQty: ReadonlyMap<string, number>
	ingredientSet: ReadonlySet<string>
	receivedByIngredient: ReadonlyMap<string, number>
}): Map<string, number> {
	const transitById = new Map<string, number>()
	const seen = new Set<string>()
	for (const link of input.transitLinks) {
		if (seen.has(link.purchase_item_id)) continue
		seen.add(link.purchase_item_id)
		if (!input.ingredientSet.has(link.ingredient_id)) continue
		const qty = (input.purchaseQty.get(link.purchase_item_id) ?? 0) * (Number(link.conversion_factor ?? 1) || 1)
		transitById.set(link.ingredient_id, (transitById.get(link.ingredient_id) ?? 0) + qty)
	}
	for (const [ingredientId, received] of input.receivedByIngredient) {
		transitById.set(ingredientId, Math.max(0, (transitById.get(ingredientId) ?? 0) - received))
	}
	return transitById
}

/** Saldo de ARP própria VIGENTE por insumo e o fornecedor esperado (o do último item lido). */
export function indexOwnArpBalances(
	arpItems: ReadonlyArray<{
		saldo_empenho: Numeric
		ni_fornecedor: string | number | null
		quantity_estimate_item: { ingredient_id: string | null }
		arp: { data_vigencia_fim: string | null }
	}>,
	today: string
): { arpBalanceById: Map<string, number>; expectedSupplierByIngredient: Map<string, string> } {
	const arpBalanceById = new Map<string, number>()
	const expectedSupplierByIngredient = new Map<string, string>()
	for (const item of arpItems) {
		const ingredientId = item.quantity_estimate_item.ingredient_id
		if (!ingredientId) continue
		if (item.arp.data_vigencia_fim != null && item.arp.data_vigencia_fim < today) continue
		arpBalanceById.set(ingredientId, (arpBalanceById.get(ingredientId) ?? 0) + Number(item.saldo_empenho ?? 0))
		if (item.ni_fornecedor != null) expectedSupplierByIngredient.set(ingredientId, String(item.ni_fornecedor))
	}
	return { arpBalanceById, expectedSupplierByIngredient }
}

/**
 * Lead times observados por item de compra — mediana global misturava fornecedores/itens sem
 * relação (review) e contaminava a recomendação de canal. Cada linha entra na chave composta
 * fornecedor:item e na só-item (fallback quando o fornecedor esperado é desconhecido).
 */
export function groupObservedLeadTimes(
	leadTimes: ReadonlyArray<{ purchase_item_id: string | null; ni_fornecedor: string | null; lead_time_days: Numeric }>
): Map<string, number[]> {
	const observedByPurchaseItem = new Map<string, number[]>()
	for (const row of leadTimes) {
		if (row.purchase_item_id == null || !Number.isFinite(Number(row.lead_time_days))) continue
		// chave composta fornecedor:item; fallback só-item quando o fornecedor
		// esperado é desconhecido (review: mediana misturava fornecedores)
		for (const key of [row.ni_fornecedor != null ? `${row.ni_fornecedor}:${row.purchase_item_id}` : null, row.purchase_item_id].filter((key) => key != null)) {
			const list = observedByPurchaseItem.get(key) ?? []
			list.push(Number(row.lead_time_days))
			observedByPurchaseItem.set(key, list)
		}
	}
	return observedByPurchaseItem
}

// ─── Sugestão por insumo ─────────────────────────────────────────────────────

export interface ReplenishmentNeed {
	ingredient_id: string
	ingredient_name: string
	measure_unit: string | null
	estimated_quantity: number
}

export interface IngredientFactors {
	correction_factor: number | null
	rehydration_index: number | null
}

export interface StockPolicyLike {
	min_stock: Numeric
	coverage_days: number | null
	urgency_threshold_days: number | null
}

export interface ReplenishmentContext extends DefaultPurchaseIndex {
	horizonDays: number
	factorsById: ReadonlyMap<string, IngredientFactors>
	stockById: ReadonlyMap<string, StockEntry>
	transitById: ReadonlyMap<string, number>
	policyById: ReadonlyMap<string, StockPolicyLike>
	expectedSupplierByIngredient: ReadonlyMap<string, string>
	observedByPurchaseItem: ReadonlyMap<string, number[]>
	arpBalanceById: ReadonlyMap<string, number>
	classByCatmat: ReadonlyMap<number, string>
	/** Folga da dispensa por ramo. MUTÁVEL: a folga consumida por uma sugestão desconta das seguintes. */
	dispensaRoom: Map<string, number | null>
}

export function resolveGrossDemand(estimatedQuantity: number, factors: IngredientFactors | undefined): number {
	return applyCorrectionFactors(estimatedQuantity, {
		correctionFactor: factors?.correction_factor != null ? Number(factors.correction_factor) : null,
		rehydrationIndex: factors?.rehydration_index != null ? Number(factors.rehydration_index) : null,
	})
}

/**
 * Prefere o histórico do FORNECEDOR esperado (ARP vigente) para o item; sem fornecedor conhecido,
 * cai no histórico do item (todos fornecedores). Sem item de compra padrão, nada observado.
 */
export function resolveObservedLeadDays(
	defaultPurchaseId: string | undefined,
	expectedSupplier: string | undefined,
	observedByPurchaseItem: ReadonlyMap<string, number[]>
): number[] {
	if (defaultPurchaseId == null) return []
	return (
		(expectedSupplier != null ? observedByPurchaseItem.get(`${expectedSupplier}:${defaultPurchaseId}`) : undefined) ??
		observedByPurchaseItem.get(defaultPurchaseId) ??
		[]
	)
}

/**
 * O valor tem de caber no que RESTA do limite no ramo do item — o somatório do exercício, não o
 * item sozinho (art. 75, § 1º). A folga consumida por uma sugestão desconta das seguintes do mesmo
 * ramo (muta `dispensaRoom`); sem classe ou com dispensa sem valor, não se presume folga.
 */
export function reserveDispensaRoom(input: {
	catmat: number | undefined
	estimatedValue: number | null
	classByCatmat: ReadonlyMap<number, string>
	dispensaRoom: Map<string, number | null>
}): { smallValue: boolean; remaining: number | null } {
	const lineCode = input.catmat != null ? input.classByCatmat.get(input.catmat) : undefined
	const remaining = lineCode ? (input.dispensaRoom.get(lineCode) ?? null) : null
	const smallValue = fitsDispensaRoom(input.estimatedValue, remaining)
	if (smallValue && lineCode && remaining != null && input.estimatedValue != null) input.dispensaRoom.set(lineCode, remaining - input.estimatedValue)
	return { smallValue, remaining }
}

export function formatCalcMemory(input: {
	estimatedQuantity: number
	factors: IngredientFactors | undefined
	grossDemand: number
	minStock: number
	stock: StockEntry
	inTransit: number
	netNeed: number
}): string {
	const { estimatedQuantity, factors, grossDemand, minStock, stock, inTransit, netNeed } = input
	return `bruta ${estimatedQuantity} × FC ${factors?.correction_factor ?? 1} ÷ IR ${factors?.rehydration_index ?? 1} = ${grossDemand}${minStock > 0 ? ` + mínimo ${minStock}` : ""}; − estoque ${stock.available.toFixed(2)} (excl. ${stock.expiring.toFixed(2)} vencendo) − trânsito ${inTransit} = ${netNeed}`
}

/** Sugestão de um insumo, com memória de cálculo. Chamada em ordem: consome a folga da dispensa. */
export function buildReplenishmentSuggestion(need: ReplenishmentNeed, ctx: ReplenishmentContext): ReplenishmentSuggestion {
	const factors = ctx.factorsById.get(need.ingredient_id)
	const grossDemand = resolveGrossDemand(need.estimated_quantity, factors)
	const stock = ctx.stockById.get(need.ingredient_id) ?? { available: 0, expiring: 0 }
	const inTransit = Number((ctx.transitById.get(need.ingredient_id) ?? 0).toFixed(4))
	// estoque mínimo da política entra na demanda: a sugestão precisa
	// recompor a reserva, não só cobrir o horizonte (review)
	const policy = ctx.policyById.get(need.ingredient_id)
	const minStock = Number(policy?.min_stock ?? 0)
	const netNeed = calculateNetNeed({ grossDemand: grossDemand + minStock, availableStock: stock.available, inTransit })

	const dailyDemand = grossDemand / ctx.horizonDays
	const coverageDays = dailyDemand > 0 ? Math.floor(stock.available / dailyDemand) : ctx.horizonDays
	const observedDays = resolveObservedLeadDays(
		ctx.defaultPurchaseByIngredient.get(need.ingredient_id),
		ctx.expectedSupplierByIngredient.get(need.ingredient_id),
		ctx.observedByPurchaseItem
	)
	const leadTime = estimateLeadTime(observedDays, null, policy?.coverage_days ?? 7)
	// valor estimado ≈ (necessidade ÷ fator de conversão) × preço unitário
	// do item de compra; limite de dispensa por valor (art. 75, I/II da
	// Lei 14.133 — teto atualizado por decreto) habilita o Contrata+
	// (review: canal ficava permanentemente inalcançável)
	const price = ctx.priceByIngredient.get(need.ingredient_id)
	const estimatedValue = price?.unitPrice != null ? (netNeed / price.conversionFactor) * price.unitPrice : null
	const { smallValue, remaining } = reserveDispensaRoom({
		catmat: ctx.catmatCodeByIngredient.get(need.ingredient_id),
		estimatedValue,
		classByCatmat: ctx.classByCatmat,
		dispensaRoom: ctx.dispensaRoom,
	})
	const decision = decideChannel({
		netNeed,
		ownArpBalance: ctx.arpBalanceById.get(need.ingredient_id) ?? 0,
		// carona não é pesquisada automaticamente (custo de API por item);
		// a busca manual de ARP externa fica na tela de anexos quantitativos
		caronaAvailable: null,
		hasCatmat: ctx.catmatByIngredient.get(need.ingredient_id) ?? false,
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
		calcMemory: formatCalcMemory({ estimatedQuantity: need.estimated_quantity, factors, grossDemand, minStock, stock, inTransit, netNeed }),
	}
}

/** Só o que precisa de compra ou tem lote vencendo; maior necessidade primeiro. */
export function rankReplenishmentSuggestions(suggestions: ReplenishmentSuggestion[]): ReplenishmentSuggestion[] {
	return suggestions.filter((s) => s.netNeed > 0 || s.expiringExcluded > 0).sort((a, b) => b.netNeed - a.netNeed)
}
