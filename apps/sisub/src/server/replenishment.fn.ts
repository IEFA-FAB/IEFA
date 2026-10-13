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
	type AcquisitionKind,
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
} from "@iefa/sisub-domain"
import { addCivilDays, getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { type ExecutionAcquisitionRow, loadUnitExecution } from "@/lib/acquisition-execution"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { assertNoBlindCountHides } from "@/lib/blind-count.server"
import { getDb } from "@/lib/db.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { currentFiscalYear } from "@/lib/expense-execution"
import { purchaseUnitIdOfKitchen } from "@/lib/kitchen-purchase-unit.server"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { checkSupplierSicaf } from "@/lib/sicaf.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

/** Linha de `acquisition` pela costura frouxa de `loadUnitExecution`; colunas em `loadDispensaRoomByClass`. */
type DispensaAcquisitionRow = ExecutionAcquisitionRow & {
	kind: AcquisitionKind
	direct_contract_clause: string | null
	activity_line: string | null
	nd: string | null
	estimated_value: number | string | null
}

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
	// O empenhado por contratação vem de `loadUnitExecution`, a mesma leitura (paginada, com a NE
	// de dezembro emitida em janeiro) da prévia do somatório na tela de contratações: duas contas
	// do mesmo limite divergiriam, e a reposição aprovaria a dispensa que a tela recusa.
	const [{ data: limitRows, error: limitError }, execution] = await Promise.all([
		procurement().from("direct_contract_limit").select("clause, valid_from, value, source_act"),
		loadUnitExecution<DispensaAcquisitionRow>(
			{ procurement: procurement(), finance: getServerClient("finance") },
			{ unitId, fiscalYear: year, acquisitionColumns: "id, kind, direct_contract_clause, fiscal_year, activity_line, nd, estimated_value" }
		),
	])
	if (limitError) throw new Error(`Erro ao ler o limite da dispensa: ${publicDbMessage(limitError)}`)
	const limits: DirectContractLimitRow[] = (limitRows ?? []).map((row) => ({
		clause: row.clause,
		validFrom: row.valid_from,
		value: Number(row.value),
		sourceAct: row.source_act,
	}))
	const committed = new Map<string, number>()
	for (const empenho of execution.empenhos) {
		if (empenho.acquisition_id && empenho.status === "ativo") {
			committed.set(empenho.acquisition_id, (committed.get(empenho.acquisition_id) ?? 0) + (execution.vigenteById.get(empenho.id) ?? 0))
		}
	}
	// `computeDispensaSum` só soma `kind === "dispensa"`; as demais contratações do exercício passam.
	const others: DispensaEntry[] = execution.acquisitions.map((row) => ({
		id: row.id,
		label: row.id,
		kind: row.kind,
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
	const compras = getServerClient("compras_gov_integration")
	// Códigos vão como texto pelo fatiador e voltam a número no `.in()`.
	const items = await readAllPagesIn("o CATMAT", catmats.map(String), (chunk, from, to) =>
		compras.from("compras_material_item").select("codigo_item, codigo_pdm").in("codigo_item", chunk.map(Number)).order("codigo_item").range(from, to)
	)
	const pdms = items.map((row) => row.codigo_pdm).filter((pdm) => pdm != null)
	const pdmRows = await readAllPagesIn("o PDM", pdms.map(String), (chunk, from, to) =>
		compras.from("compras_material_pdm").select("codigo_pdm, codigo_classe").in("codigo_pdm", chunk.map(Number)).order("codigo_pdm").range(from, to)
	)
	const classByPdm = new Map<number, string>(pdmRows.map((row) => [row.codigo_pdm, String(row.codigo_classe)]))
	for (const row of items) {
		const code = row.codigo_pdm != null ? classByPdm.get(row.codigo_pdm) : undefined
		if (code) byCatmat.set(row.codigo_item, code)
	}
	return byCatmat
}

const inventory = () => getServerClient("inventory")
const kitchen = () => getServerClient("kitchen")
const procurement = () => getServerClient("procurement")

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

		const today = getBrasiliaToday()
		const horizonEnd = addCivilDays(today, data.horizonDays)

		// (1) demanda bruta do horizonte (cardápios reais; fórmula compartilhada)
		const needs = await fetchProcurementNeeds(getDb(), ctx, { startDate: today, endDate: horizonEnd, kitchenId: data.kitchenId })
		if (needs.length === 0) return []
		const ingredientIds = needs.map((n) => n.ingredient_id)

		const ingredientSet = new Set(ingredientIds)

		// Toda leitura daqui lança e pagina: leitura que falha ou corta calada vira sugestão de
		// compra errada (estoque ou trânsito a menos = comprar o que já tem). As independentes
		// correm juntas, em duas etapas.
		const [ingredients, balances, transitOrders, links, policies, purchaseUnitId] = await Promise.all([
			// (2) FC/IR do ingrediente (herança receita→ingrediente fica no anexo quantitativo; aqui é reposição)
			readAllPagesIn("os fatores dos insumos", ingredientIds, (chunk, from, to) =>
				kit.from("ingredient").select("id, correction_factor, rehydration_index").in("id", chunk).order("id").range(from, to)
			),
			// (3) estoque disponível. Só saldo positivo: lote esgotado fica na view e só pesaria a
			// leitura. A ordem é a chave inteira da view (`stock.fn.ts` lê igual): `lot_id` sozinho
			// empata no saldo sem lote e a paginação por offset repetiria ou pularia linha.
			readAllPagesIn("o saldo dos insumos", ingredientIds, (chunk, from, to) =>
				inv
					.from("v_stock_balance")
					.select("ingredient_id, frozen_preparation_id, lot_id, balance, expiry_date")
					.eq("kitchen_id", data.kitchenId)
					.in("ingredient_id", chunk)
					.gt("balance", 0)
					.order("ingredient_id")
					.order("frozen_preparation_id")
					.order("lot_id")
					.range(from, to)
			),
			// (4) em trânsito: OFs enviadas/parciais → purchase_item → ingrediente
			readAllPages("as OFs em trânsito", (from, to) =>
				proc
					.from("supply_order")
					.select("id, supply_order_item (purchase_item_id, ordered_qty)")
					.eq("kitchen_id", data.kitchenId)
					.in("status", ["sent", "partially_received"])
					.order("id")
					.range(from, to)
			),
			readAllPagesIn("os itens de compra padrão", ingredientIds, (chunk, from, to) =>
				proc
					.from("purchase_item_ingredient")
					.select("id, ingredient_id, purchase_item_id, conversion_factor, is_default, purchase_item:purchase_item_id (catmat_item_codigo, unit_price)")
					.in("ingredient_id", chunk)
					.eq("is_default", true)
					.order("id")
					.range(from, to)
			),
			// (6) política
			readAllPagesIn("as políticas de estoque", ingredientIds, (chunk, from, to) =>
				inv.from("stock_policy").select("*").eq("kitchen_id", data.kitchenId).in("ingredient_id", chunk).order("id").range(from, to)
			),
			purchaseUnitIdOfKitchen(data.kitchenId),
		])

		const factorsById = new Map(ingredients.map((i) => [i.id, i]))
		const stockById = new Map<string, { available: number; expiring: number }>()
		for (const row of balances) {
			if (row.ingredient_id == null) continue // filtrado no `.in()`; coluna de view sai nulável
			const entry = stockById.get(row.ingredient_id) ?? { available: 0, expiring: 0 }
			const qty = Number(row.balance)
			if (qty <= 0) continue
			if (row.expiry_date != null && row.expiry_date <= horizonEnd) entry.expiring += qty
			else entry.available += qty
			stockById.set(row.ingredient_id, entry)
		}
		const purchaseQty = new Map<string, number>()
		for (const order of transitOrders) {
			for (const item of order.supply_order_item ?? []) {
				if (!item.purchase_item_id) continue
				purchaseQty.set(item.purchase_item_id, (purchaseQty.get(item.purchase_item_id) ?? 0) + Number(item.ordered_qty))
			}
		}
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
		const policyById = new Map(policies.map((p) => [p.ingredient_id, p]))

		const [receiptItems, transitLinks, arpItems, leadTimes, classByCatmat] = await Promise.all([
			// OF parcialmente recebida: o que já entrou em definitivo sai do trânsito
			// (review: trânsito superestimado suprimia sugestões necessárias)
			(async () => {
				const receipts = await readAllPagesIn(
					"os recebimentos das OFs em trânsito",
					transitOrders.map((o) => o.id),
					(chunk, from, to) => inv.from("goods_receipt").select("id").in("supply_order_id", chunk).not("definitive_at", "is", null).order("id").range(from, to)
				)
				return readAllPagesIn(
					"os itens recebidos das OFs em trânsito",
					receipts.map((r) => r.id),
					(chunk, from, to) => inv.from("goods_receipt_item").select("id, ingredient_id, received_qty_base").in("receipt_id", chunk).order("id").range(from, to)
				)
			})(),
			// conversão do trânsito por PURCHASE_ITEM da OF — sem exigir is_default
			// (review: OF de item não-default ficava fora do trânsito). Um link por
			// purchase_item, preferindo o default: todo item de compra cai numa fatia só,
			// então a ordem "default primeiro" vale por item.
			readAllPagesIn("a conversão do trânsito", [...purchaseQty.keys()], (chunk, from, to) =>
				proc
					.from("purchase_item_ingredient")
					.select("id, ingredient_id, purchase_item_id, conversion_factor, is_default")
					.in("purchase_item_id", chunk)
					.order("is_default", { ascending: false })
					.order("id")
					.range(from, to)
			),
			// (5) saldo oficial de ARP PRÓPRIA vigente (via item do anexo → ingrediente): só as atas
			// da unidade que compra pela cozinha. Filtrar só pelo insumo contava a ARP de outra OM
			// como saldo desta, e o canal recomendado era empenhar uma ata que a cozinha não tem.
			purchaseUnitId == null
				? Promise.resolve([])
				: readAllPagesIn("o saldo das ARPs", ingredientIds, (chunk, from, to) =>
						proc
							.from("arp_item")
							.select(
								"id, saldo_empenho, ni_fornecedor, quantity_estimate_item:quantity_estimate_item_id!inner (ingredient_id), arp:arp_id!inner (unit_id, data_vigencia_fim)"
							)
							.in("quantity_estimate_item.ingredient_id", chunk)
							.eq("arp.unit_id", purchaseUnitId)
							.order("id")
							.range(from, to)
					),
			// (6) lead time observado, só dos itens de compra que a sugestão consulta: o `limit(1000)`
			// global antigo cortava o histórico de toda a Força numa amostra arbitrária. A view não
			// tem chave única (uma linha por recebimento × item da OF); ordenar por TODAS as colunas
			// lidas torna indistinguível qualquer empate que a paginação troque de lugar.
			readAllPagesIn("o lead time observado", [...defaultPurchaseByIngredient.values()], (chunk, from, to) =>
				inv
					.from("v_supplier_lead_time")
					.select("supply_order_id, purchase_item_id, ni_fornecedor, lead_time_days")
					.in("purchase_item_id", chunk)
					.order("supply_order_id")
					.order("purchase_item_id")
					.order("ni_fornecedor")
					.order("lead_time_days")
					.range(from, to)
			),
			loadMaterialClassByCatmat([...catmatCodeByIngredient.values()]),
		])

		const receivedByIngredient = new Map<string, number>()
		for (const item of receiptItems) {
			if (!item.ingredient_id) continue
			receivedByIngredient.set(item.ingredient_id, (receivedByIngredient.get(item.ingredient_id) ?? 0) + Number(item.received_qty_base))
		}
		const transitById = new Map<string, number>()
		const seen = new Set<string>()
		for (const link of transitLinks) {
			if (seen.has(link.purchase_item_id)) continue
			seen.add(link.purchase_item_id)
			if (!ingredientSet.has(link.ingredient_id)) continue
			const qty = (purchaseQty.get(link.purchase_item_id) ?? 0) * (Number(link.conversion_factor ?? 1) || 1)
			transitById.set(link.ingredient_id, (transitById.get(link.ingredient_id) ?? 0) + qty)
		}
		for (const [ingredientId, received] of receivedByIngredient) {
			transitById.set(ingredientId, Math.max(0, (transitById.get(ingredientId) ?? 0) - received))
		}

		const arpBalanceById = new Map<string, number>()
		const expectedSupplierByIngredient = new Map<string, string>()
		for (const item of arpItems) {
			const ingredientId = item.quantity_estimate_item.ingredient_id
			if (!ingredientId) continue
			if (item.arp.data_vigencia_fim != null && item.arp.data_vigencia_fim < today) continue
			arpBalanceById.set(ingredientId, (arpBalanceById.get(ingredientId) ?? 0) + Number(item.saldo_empenho ?? 0))
			if (item.ni_fornecedor != null) expectedSupplierByIngredient.set(ingredientId, String(item.ni_fornecedor))
		}

		// por item de compra — mediana global misturava fornecedores/itens sem
		// relação (review) e contaminava a recomendação de canal
		const observedByPurchaseItem = new Map<string, number[]>()
		for (const row of leadTimes) {
			if (row.purchase_item_id == null || !Number.isFinite(Number(row.lead_time_days))) continue
			// chave composta fornecedor:item; fallback só-item quando o fornecedor
			// esperado é desconhecido (review: mediana misturava fornecedores)
			for (const key of [row.ni_fornecedor != null ? `${row.ni_fornecedor}:${row.purchase_item_id}` : null, row.purchase_item_id].filter(
				(key) => key != null
			)) {
				const list = observedByPurchaseItem.get(key) ?? []
				list.push(Number(row.lead_time_days))
				observedByPurchaseItem.set(key, list)
			}
		}

		// (7) somatório da dispensa por ramo (classe do CATMAT) na unidade gestora que compra pela cozinha
		const dispensaRoom = await loadDispensaRoomByClass(purchaseUnitId, [...classByCatmat.values()])

		return needs
			.map((need) => {
				const factors = factorsById.get(need.ingredient_id)
				const grossDemand = applyCorrectionFactors(need.estimated_quantity, {
					correctionFactor: factors?.correction_factor != null ? Number(factors.correction_factor) : null,
					rehydrationIndex: factors?.rehydration_index != null ? Number(factors.rehydration_index) : null,
				})
				const stock = stockById.get(need.ingredient_id) ?? { available: 0, expiring: 0 }
				const inTransit = Number((transitById.get(need.ingredient_id) ?? 0).toFixed(4))
				// estoque mínimo da política entra na demanda: a sugestão precisa
				// recompor a reserva, não só cobrir o horizonte (review)
				const policy = policyById.get(need.ingredient_id)
				const minStock = Number(policy?.min_stock ?? 0)
				const netNeed = calculateNetNeed({ grossDemand: grossDemand + minStock, availableStock: stock.available, inTransit })

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
