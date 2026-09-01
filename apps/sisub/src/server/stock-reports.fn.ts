/**
 * @module stock-reports.fn
 * Relatórios MCASP (Fase 6): fechamento mensal (lock de período), Ficha de
 * Almoxarifado, balancete (RMA/RMB), exportação CSV por CATMAT e painel
 * empenho × liquidação.
 * CLIENT: getServerClient (service role). AUTH: `storage` 1 leitura, 3 fechar.
 * TABLES: inventory.monthly_closing, stock_movement; procurement/finance leitura.
 * @domain kitchen
 * @migration 20260729180000_inventory_monthly_closing
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

const INFLOW = new Set(["receipt", "leftover_return", "transfer_in", "adjustment_in"])
const competenciaSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM")

function monthRange(competencia: string): { from: string; to: string } {
	const [year, month] = competencia.split("-").map(Number)
	const from = `${competencia}-01T00:00:00Z`
	const next = month === 12 ? `${(year ?? 0) + 1}-01-01` : `${year}-${String((month ?? 0) + 1).padStart(2, "0")}-01`
	return { from, to: `${next}T00:00:00Z` }
}

async function describeIngredients(ids: string[]) {
	const names = new Map<string, { description: string | null; measure_unit: string | null }>()
	if (ids.length === 0) return names
	const { data } = await kitchen().from("ingredient").select("id, description, measure_unit").in("id", ids)
	for (const row of data ?? []) names.set(row.id, row)
	return names
}

/** Fechamento da competência (função SQL atômica; trava o período). */
export const closeMonthFn = createServerFn({ method: "POST" })
	.validator(z.object({ kitchenId: z.number().int().positive(), competencia: competenciaSchema }))
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const { data: result, error } = await inventory().rpc("close_month", {
			p_kitchen_id: data.kitchenId,
			p_competencia: `${data.competencia}-01`,
			p_user: userId,
		})
		if (error) {
			if (error.code === "23505") throw new Error(`Competência ${data.competencia} já fechada para esta cozinha`)
			throw new Error(`Fechamento falhou: ${error.message}`)
		}
		return { closingId: result?.[0]?.closing_id as string, items: Number(result?.[0]?.items ?? 0) }
	})

export const listClosingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: closings, error } = await inventory()
			.from("monthly_closing")
			.select("id, competencia, total_in, total_out, value_in, value_out, opening_value, closing_value, closed_at")
			.eq("kitchen_id", data.kitchenId)
			.order("competencia", { ascending: false })
			.limit(24)
		if (error) throw new Error(`Erro ao listar fechamentos: ${error.message}`)
		return closings ?? []
	})

/**
 * Balancete da competência (RMA): saldo inicial + entradas − saídas = final,
 * por ingrediente, em quantidade e valor. Confere por construção com o ledger.
 */
export const fetchBalanceteFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), competencia: competenciaSchema }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { from, to } = monthRange(data.competencia)

		const { data: moves, error } = await inventory()
			.from("stock_movement")
			.select("ingredient_id, frozen_preparation_id, type, quantity, total_cost, created_at")
			.eq("kitchen_id", data.kitchenId)
			.lt("created_at", to)
		if (error) throw new Error(`Erro ao consultar ledger: ${error.message}`)

		type Row = {
			key: string
			ingredientId: string | null
			frozenId: string | null
			openQty: number
			openVal: number
			inQty: number
			inVal: number
			outQty: number
			outVal: number
		}
		const rows = new Map<string, Row>()
		for (const move of moves ?? []) {
			const key = move.ingredient_id ? `i:${move.ingredient_id}` : `f:${move.frozen_preparation_id}`
			const row = rows.get(key) ?? {
				key,
				ingredientId: move.ingredient_id,
				frozenId: move.frozen_preparation_id,
				openQty: 0,
				openVal: 0,
				inQty: 0,
				inVal: 0,
				outQty: 0,
				outVal: 0,
			}
			const qty = Number(move.quantity)
			const val = Number(move.total_cost ?? 0)
			const inflow = INFLOW.has(move.type)
			if (move.created_at < from) {
				row.openQty += inflow ? qty : -qty
				row.openVal += inflow ? val : -val
			} else if (inflow) {
				row.inQty += qty
				row.inVal += val
			} else {
				row.outQty += qty
				row.outVal += val
			}
			rows.set(key, row)
		}

		const names = await describeIngredients([...rows.values()].map((r) => r.ingredientId).filter((id): id is string => id != null))
		return [...rows.values()]
			.map((row) => ({
				...row,
				description: row.ingredientId ? (names.get(row.ingredientId)?.description ?? "—") : "(preparação congelada)",
				measureUnit: row.ingredientId ? (names.get(row.ingredientId)?.measure_unit ?? null) : null,
				finalQty: Number((row.openQty + row.inQty - row.outQty).toFixed(4)),
				finalVal: Number((row.openVal + row.inVal - row.outVal).toFixed(4)),
			}))
			.sort((a, b) => (a.description ?? "").localeCompare(b.description ?? "", "pt-BR"))
	})

/** Ficha de Almoxarifado: ledger cronológico do item com saldo acumulado. */
export const fetchLedgerSheetFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), ingredientId: z.string().uuid(), competencia: competenciaSchema }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { from, to } = monthRange(data.competencia)
		const inv = inventory()

		const { data: before } = await inv
			.from("stock_movement")
			.select("type, quantity, total_cost")
			.eq("kitchen_id", data.kitchenId)
			.eq("ingredient_id", data.ingredientId)
			.lt("created_at", from)
		let running = 0
		for (const move of before ?? []) running += INFLOW.has(move.type) ? Number(move.quantity) : -Number(move.quantity)
		const opening = Number(running.toFixed(4))

		const { data: moves, error } = await inv
			.from("stock_movement")
			.select("id, type, quantity, unit_cost, total_cost, justification, created_at, lot_id")
			.eq("kitchen_id", data.kitchenId)
			.eq("ingredient_id", data.ingredientId)
			.gte("created_at", from)
			.lt("created_at", to)
			.order("created_at", { ascending: true })
		if (error) throw new Error(`Erro ao consultar ficha: ${error.message}`)

		const entries = (moves ?? []).map((move: { type: string; quantity: number }) => {
			running += INFLOW.has(move.type) ? Number(move.quantity) : -Number(move.quantity)
			return { ...move, running: Number(running.toFixed(4)) }
		})
		return { opening, entries }
	})

/** Exportação por CATMAT (SIAFI/SIADS): agrega o balancete pelo item de compra default. */
export const exportCatmatCsvFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), competencia: competenciaSchema }))
	.handler(async ({ data }): Promise<string> => {
		await requireStorageForKitchen(1, data.kitchenId)
		const balancete = await fetchBalanceteFn({ data })

		const ingredientIds = balancete.map((row) => row.ingredientId).filter((id): id is string => id != null)
		const catmatByIngredient = new Map<string, { codigo: number | null; descricao: string | null }>()
		if (ingredientIds.length > 0) {
			const proc = getServerClient("procurement") as unknown as LooseClient
			const { data: links } = await proc
				.from("purchase_item_ingredient")
				.select("ingredient_id, is_default, purchase_item:purchase_item_id (catmat_item_codigo, catmat_item_descricao)")
				.in("ingredient_id", ingredientIds)
				.eq("is_default", true)
			for (const link of links ?? []) {
				catmatByIngredient.set(link.ingredient_id, {
					codigo: link.purchase_item?.catmat_item_codigo ?? null,
					descricao: link.purchase_item?.catmat_item_descricao ?? null,
				})
			}
		}

		const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
		const lines = [["catmat_codigo", "catmat_descricao", "item", "unidade", "saldo_inicial", "entradas", "saidas", "saldo_final", "valor_final"].join(";")]
		// itens COM catmat primeiro; sem catmat em seção separada no fim (spec)
		const withCatmat = balancete.filter((row) => row.ingredientId != null && catmatByIngredient.get(row.ingredientId)?.codigo != null)
		const withoutCatmat = balancete.filter((row) => !(row.ingredientId != null && catmatByIngredient.get(row.ingredientId)?.codigo != null))
		for (const row of [...withCatmat, ...withoutCatmat]) {
			const catmat = row.ingredientId ? catmatByIngredient.get(row.ingredientId) : null
			lines.push(
				[
					catmat?.codigo ?? "",
					esc(catmat?.descricao ?? (catmat?.codigo == null ? "SEM CATMAT" : "")),
					esc(row.description),
					row.measureUnit ?? "",
					row.openQty.toFixed(4),
					row.inQty.toFixed(4),
					row.outQty.toFixed(4),
					row.finalQty.toFixed(4),
					row.finalVal.toFixed(4),
				].join(";")
			)
		}
		return lines.join("\n")
	})

/** Painel empenho × liquidação: empenhada | recebida (definitivos) | a receber. */
export const fetchEmpenhoLiquidacaoFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const kitchenDb = getServerClient("kitchen") as unknown as LooseClient
		const finance = getServerClient("finance") as unknown as LooseClient

		const { data: kitchenRow } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).single()
		const unitId = kitchenRow?.purchase_unit_id ?? kitchenRow?.unit_id
		if (unitId == null) return []

		const { data: empenhos } = await finance
			.from("empenho")
			.select("id, numero_empenho, quantidade_empenhada, valor_total, status")
			.eq("unit_id", unitId)
			.eq("status", "ativo")
			.order("data_empenho", { ascending: false })
			.limit(100)
		const list = empenhos ?? []
		if (list.length === 0) return []

		const { data: receipts } = await inv
			.from("goods_receipt")
			.select("id, empenho_id, definitive_at")
			.in(
				"empenho_id",
				list.map((e: { id: string }) => e.id)
			)
			.not("definitive_at", "is", null)
		const receiptIds = (receipts ?? []).map((r: { id: string }) => r.id)
		const receivedByEmpenho = new Map<string, number>()
		if (receiptIds.length > 0) {
			const { data: items } = await inv.from("goods_receipt_item").select("receipt_id, received_qty_base").in("receipt_id", receiptIds)
			const empenhoByReceipt = new Map((receipts ?? []).map((r: { id: string; empenho_id: string }) => [r.id, r.empenho_id]))
			for (const item of items ?? []) {
				const empenhoId = empenhoByReceipt.get(item.receipt_id)
				if (!empenhoId) continue
				receivedByEmpenho.set(empenhoId as string, (receivedByEmpenho.get(empenhoId as string) ?? 0) + Number(item.received_qty_base))
			}
		}

		return list.map((empenho: { id: string; numero_empenho: string; quantidade_empenhada: number; valor_total: number }) => {
			const received = Number((receivedByEmpenho.get(empenho.id) ?? 0).toFixed(4))
			return {
				empenhoId: empenho.id,
				numeroEmpenho: empenho.numero_empenho,
				empenhada: Number(empenho.quantidade_empenhada),
				recebida: received,
				aReceber: Number((Number(empenho.quantidade_empenhada) - received).toFixed(4)),
				valorTotal: Number(empenho.valor_total),
			}
		})
	})
