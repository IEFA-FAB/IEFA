/**
 * Avisos de disponibilidade do Agendamento da Produção: insumo agendado que não tem como chegar
 * (sem estoque na semana; sem estoque, OF nem empenho no mês; sem contratação vigente depois).
 * A regra está em `lib/planning-availability.ts`; aqui ficam só as leituras.
 *
 * Toda leitura lança e pagina: leitura que falha calada viraria "falta" (aviso falso, que ensina
 * a ignorar o aviso) ou "atende" (aviso que some quando mais importa).
 */

import { fetchDailyMenus } from "@iefa/sisub-domain"
import { getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { hiddenByBlindCount } from "@/lib/blind-count.server"
import { getDb } from "@/lib/db.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { handleDomainError } from "@/lib/domain-errors"
import { purchaseUnitIdOfKitchen } from "@/lib/kitchen-purchase-unit.server"
import { type AvailabilityChecks, type AvailabilityWarning, classifyAvailability, collectPlannedNeeds, endOfCivilWeek } from "@/lib/planning-availability"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { getServerClient } from "@/lib/supabase.server"

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

type Window = { from: string | null; to: string | null }

function pushWindow(map: Map<string, Window[]>, ingredientId: string, window: Window) {
	const list = map.get(ingredientId) ?? []
	list.push(window)
	map.set(ingredientId, list)
}

export const fetchPlanningAvailabilityFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), startDate: civilDate, endDate: civilDate }))
	.handler(async ({ data }): Promise<{ today: string; warnings: AvailabilityWarning[]; checks: AvailabilityChecks | null }> => {
		const ctx = await requireAuth()
		const today = getBrasiliaToday()
		// O passado não tem mais o que trocar: a leitura começa hoje.
		const startDate = data.startDate > today ? data.startDate : today
		if (startDate > data.endDate) return { today, warnings: [], checks: null }
		// A semana atual se mede no total dela (o arroz de segunda e o de quarta saem do mesmo
		// saldo): olhando um dia só da semana, a leitura cobre a semana inteira mesmo assim.
		const weekEnd = endOfCivilWeek(today)
		const touchesWeek = startDate <= weekEnd
		const readStart = touchesWeek ? today : startDate
		const readEnd = touchesWeek && weekEnd > data.endDate ? weekEnd : data.endDate

		// Mesma leitura (e mesmo guard: `kitchen` nível 1 na cozinha) do calendário.
		const menus = await fetchDailyMenus(getDb(), ctx, { kitchenId: data.kitchenId, startDate: readStart, endDate: readEnd }).catch(handleDomainError)
		const needs = collectPlannedNeeds(menus, today)
		if (needs.length === 0) return { today, warnings: [], checks: null }

		const ingredientIds = [...new Set(needs.map((n) => n.ingredientId))]
		const kitchenId = data.kitchenId
		const inv = getServerClient("inventory")
		const proc = getServerClient("procurement")
		const fin = getServerClient("finance")

		const [hidden, purchaseUnitId, links, lots, transitOrders, anyLot] = await Promise.all([
			hiddenByBlindCount(kitchenId, ctx),
			purchaseUnitIdOfKitchen(kitchenId),
			readAllPagesIn("os itens de compra dos insumos", ingredientIds, (chunk, from, to) =>
				proc
					.from("purchase_item_ingredient")
					.select("id, ingredient_id, purchase_item_id, purchase_item:purchase_item_id!inner (catmat_item_codigo, deleted_at)")
					.in("ingredient_id", chunk)
					.is("purchase_item.deleted_at", null)
					.order("id")
					.range(from, to)
			),
			// Saldo que serve hoje: sem quarentena e sem vencido. A ordem é a chave inteira da view.
			readAllPagesIn("o saldo dos insumos", ingredientIds, (chunk, from, to) =>
				inv
					.from("v_lot_expiry")
					.select("lot_id, ingredient_id, frozen_preparation_id, balance, expiry_date, quarantined_at")
					.eq("kitchen_id", kitchenId)
					.in("ingredient_id", chunk)
					.gt("balance", 0)
					.is("quarantined_at", null)
					.order("ingredient_id")
					.order("lot_id")
					.range(from, to)
			),
			readAllPages("as OFs em trânsito", (from, to) =>
				proc
					.from("supply_order")
					.select("id, supply_order_item (purchase_item_id)")
					.eq("kitchen_id", kitchenId)
					.in("status", ["sent", "partially_received"])
					.order("id")
					.range(from, to)
			),
			// A cozinha controla estoque no sisub? Basta um lote, mesmo esgotado.
			(async () => {
				const { data: row, error } = await inv.from("v_stock_balance").select("lot_id").eq("kitchen_id", kitchenId).limit(1).maybeSingle()
				if (error) throw new Error(`Erro ao conferir o estoque da cozinha: ${publicDbMessage(error)}`)
				return row != null
			})(),
		])

		// item de compra → insumos (só os agendados) e CATMAT → insumos
		const ingredientsByPurchaseItem = new Map<string, Set<string>>()
		const ingredientsByCatmat = new Map<string, Set<string>>()
		for (const link of links) {
			if (!link.ingredient_id || !link.purchase_item_id) continue
			const byItem = ingredientsByPurchaseItem.get(link.purchase_item_id) ?? new Set()
			byItem.add(link.ingredient_id)
			ingredientsByPurchaseItem.set(link.purchase_item_id, byItem)
			const catmat = link.purchase_item?.catmat_item_codigo
			if (catmat != null) {
				const key = String(catmat)
				const byCatmat = ingredientsByCatmat.get(key) ?? new Set()
				byCatmat.add(link.ingredient_id)
				ingredientsByCatmat.set(key, byCatmat)
			}
		}
		const purchasable = new Set(links.map((l) => l.ingredient_id).filter((id): id is string => Boolean(id)))

		const stock = new Map<string, number>()
		for (const lot of lots) {
			if (!lot.ingredient_id || (lot.expiry_date != null && lot.expiry_date < today)) continue
			stock.set(lot.ingredient_id, (stock.get(lot.ingredient_id) ?? 0) + Number(lot.balance))
		}

		const inTransit = new Set<string>()
		for (const order of transitOrders) {
			for (const item of order.supply_order_item ?? []) {
				for (const id of (item.purchase_item_id && ingredientsByPurchaseItem.get(item.purchase_item_id)) || []) inTransit.add(id)
			}
		}

		const contractWindows = new Map<string, Window[]>()
		const empenhoCovered = new Set<string>()
		let usesContracts = false
		// Sem unidade compradora não há ata nem empenho: tudo que não está em estoque vira aviso.
		if (purchaseUnitId != null) {
			const catmatCodes = [...ingredientsByCatmat.keys()]
			const [arpByAnnex, arpByCatmat, empenhos] = await Promise.all([
				// ARP que nasceu do anexo: o item aponta o insumo.
				readAllPagesIn("os itens de ata dos insumos", ingredientIds, (chunk, from, to) =>
					proc
						.from("arp_item")
						.select(
							"id, saldo_empenho, catmat_item_codigo, quantity_estimate_item:quantity_estimate_item_id!inner (ingredient_id), arp:arp_id!inner (unit_id, data_vigencia_inicio, data_vigencia_fim)"
						)
						.in("quantity_estimate_item.ingredient_id", chunk)
						.eq("arp.unit_id", purchaseUnitId)
						.order("id")
						.range(from, to)
				),
				// Carona e ata manual só têm o CATMAT.
				readAllPagesIn("os itens de ata pelo CATMAT", catmatCodes, (chunk, from, to) =>
					proc
						.from("arp_item")
						.select(
							"id, saldo_empenho, catmat_item_codigo, quantity_estimate_item:quantity_estimate_item_id (ingredient_id), arp:arp_id!inner (unit_id, data_vigencia_inicio, data_vigencia_fim)"
						)
						.in("catmat_item_codigo", chunk.map(Number))
						.eq("arp.unit_id", purchaseUnitId)
						.order("id")
						.range(from, to)
				),
				readAllPages("os empenhos ativos", (from, to) =>
					fin.from("empenho").select("id, acquisition_id").eq("unit_id", purchaseUnitId).eq("status", "ativo").order("id").range(from, to)
				),
			])

			// item de ata → insumos agendados que ele atende (pelo anexo ou pelo CATMAT)
			const planned = new Set(ingredientIds)
			const arpIngredients = new Map<string, Set<string>>()
			const indexArpItem = (item: ArpItemLink): Set<string> => {
				const ids = new Set<string>()
				const fromAnnex = item.quantity_estimate_item?.ingredient_id
				if (fromAnnex && planned.has(fromAnnex)) ids.add(fromAnnex)
				for (const id of (item.catmat_item_codigo != null && ingredientsByCatmat.get(String(item.catmat_item_codigo))) || []) ids.add(id)
				arpIngredients.set(item.id, ids)
				return ids
			}
			for (const item of [...arpByAnnex, ...arpByCatmat]) {
				const ids = indexArpItem(item)
				// Ata sem saldo para empenhar não atende a data, mesmo vigente. Saldo nulo é
				// desconhecido (ata manual sem sincronização): conta como atende.
				if (item.saldo_empenho != null && Number(item.saldo_empenho) <= 0) continue
				for (const id of ids) pushWindow(contractWindows, id, { from: item.arp.data_vigencia_inicio, to: item.arp.data_vigencia_fim })
			}

			usesContracts = empenhos.length > 0 || (await unitHasArp(purchaseUnitId))
			const empenhoIds = empenhos.map((e) => e.id)
			const acquisitionIds = [...new Set(empenhos.map((e) => e.acquisition_id).filter((id): id is string => Boolean(id)))]
			const [saldos, empenhoItems, acquisitions] = await Promise.all([
				readAllPagesIn("o saldo dos empenhos", empenhoIds, (chunk, from, to) =>
					fin.from("v_empenho_saldo").select("empenho_id, saldo_a_liquidar").in("empenho_id", chunk).order("empenho_id").range(from, to)
				),
				readAllPagesIn("os itens dos empenhos", empenhoIds, (chunk, from, to) =>
					fin.from("empenho_item").select("id, empenho_id, purchase_item_id, arp_item_id").in("empenho_id", chunk).order("id").range(from, to)
				),
				readAllPagesIn("as contratações de origem", acquisitionIds, (chunk, from, to) =>
					proc.from("acquisition").select("id, valid_from, valid_to").in("id", chunk).is("deleted_at", null).order("id").range(from, to)
				),
			])
			// Empenho de item de ata que não veio nas leituras acima (ata já vencida, por exemplo).
			const missingArpItems = [...new Set(empenhoItems.flatMap((i) => (i.arp_item_id && !arpIngredients.has(i.arp_item_id) ? [i.arp_item_id] : [])))]
			const extraArpItems = await readAllPagesIn("os itens de ata dos empenhos", missingArpItems, (chunk, from, to) =>
				proc
					.from("arp_item")
					.select("id, catmat_item_codigo, quantity_estimate_item:quantity_estimate_item_id (ingredient_id)")
					.in("id", chunk)
					.order("id")
					.range(from, to)
			)
			for (const item of extraArpItems) indexArpItem(item)

			const withBalance = new Set(saldos.filter((s) => s.empenho_id && Number(s.saldo_a_liquidar ?? 0) > 0).map((s) => s.empenho_id as string))
			const acquisitionOf = new Map(empenhos.map((e) => [e.id, e.acquisition_id]))
			const windowOf = new Map(acquisitions.map((a) => [a.id, { from: a.valid_from, to: a.valid_to }]))
			for (const item of empenhoItems) {
				const ids = new Set<string>([
					...((item.purchase_item_id && ingredientsByPurchaseItem.get(item.purchase_item_id)) || []),
					...((item.arp_item_id && arpIngredients.get(item.arp_item_id)) || []),
				])
				if (ids.size === 0) continue
				if (withBalance.has(item.empenho_id)) for (const id of ids) empenhoCovered.add(id)
				// Dispensa, contrato e inexigibilidade não têm item próprio: o empenho é que diz o
				// que a contratação cobre, pela vigência dela.
				const acquisitionId = acquisitionOf.get(item.empenho_id)
				const window = acquisitionId ? windowOf.get(acquisitionId) : undefined
				if (window && (window.from != null || window.to != null)) for (const id of ids) pushWindow(contractWindows, id, window)
			}
		}

		const checks: AvailabilityChecks = { stock: anyLot, contracts: usesContracts }
		const warnings = classifyAvailability(needs, { purchasable, contractWindows, empenhoCovered, inTransit, stock, hiddenStock: hidden, checks }, today)
		return { today, checks, warnings: warnings.filter((w) => w.date >= startDate && w.date <= data.endDate) }
	})

/** O que liga um item de ata a um insumo: o item do anexo de onde ele veio, ou o CATMAT. */
type ArpItemLink = { id: string; catmat_item_codigo: number | null; quantity_estimate_item: { ingredient_id: string | null } | null }

/** A unidade registra ata no sisub? Qualquer uma, vigente ou não. */
async function unitHasArp(unitId: number): Promise<boolean> {
	const { data: row, error } = await getServerClient("procurement").from("arp").select("id").eq("unit_id", unitId).limit(1).maybeSingle()
	if (error) throw new Error(`Erro ao conferir as atas da unidade: ${publicDbMessage(error)}`)
	return row != null
}
