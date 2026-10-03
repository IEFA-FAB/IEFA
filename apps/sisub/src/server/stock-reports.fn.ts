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

import { isInflow } from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { assertNoBlindCountHides, hiddenByBlindCount } from "@/lib/blind-count.server"
import { csvRow } from "@/lib/csv"
import { publicDbMessage } from "@/lib/db-error-message"
import { committedQuantity } from "@/lib/empenho-items"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

const inventory = () => getServerClient("inventory")
const kitchen = () => getServerClient("kitchen")

// A partição entrada/saída vive em UM lugar (@iefa/sisub-domain) e é conferida
// contra as triggers de custeio por sql-vocabulary.contract.test.ts. Esta era a
// terceira cópia da mesma lista: divergir dela faz o relatório contar o oposto
// do que o ledger contabilizou.
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
			throw new Error(`Fechamento falhou: ${publicDbMessage(error)}`)
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
		if (error) throw new Error(`Erro ao listar fechamentos: ${publicDbMessage(error)}`)
		return closings ?? []
	})

/**
 * Balancete da competência (RMA): saldo inicial + entradas − saídas = final,
 * por ingrediente, em quantidade e valor. Confere por construção com o ledger.
 */
export const fetchBalanceteFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), competencia: competenciaSchema }))
	.handler(async ({ data }) => {
		const ctx = await requireStorageForKitchen(1, data.kitchenId)
		await assertNoBlindCountHides(data.kitchenId, ctx, "O balancete")
		const { from, to } = monthRange(data.competencia)

		// O saldo inicial soma o ledger inteiro até a competência: passa de 1000 linhas cedo, e o
		// corte calado do PostgREST daria um balancete fechado com número errado.
		const moves = await readAllPages("o ledger", (rangeFrom, rangeTo) =>
			inventory()
				.from("stock_movement")
				.select("id, ingredient_id, frozen_preparation_id, type, quantity, total_cost, created_at")
				.eq("kitchen_id", data.kitchenId)
				.lt("created_at", to)
				.order("id")
				.range(rangeFrom, rangeTo)
		)

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
		for (const move of moves) {
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
			const inflow = isInflow(move.type)
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
	.validator(z.object({ kitchenId: z.number().int().positive(), ingredientId: z.uuid(), competencia: competenciaSchema }))
	.handler(async ({ data }) => {
		const ctx = await requireStorageForKitchen(1, data.kitchenId)
		// a ficha é o saldo acumulado do item: com o item numa contagem cega
		// aberta, ela é exatamente o número que a contagem esconde
		if ((await hiddenByBlindCount(data.kitchenId, ctx)).has(data.ingredientId)) {
			throw new Error("A ficha deste item fica indisponível enquanto ele estiver numa contagem cega aberta")
		}
		const { from, to } = monthRange(data.competencia)
		const inv = inventory()

		const before = await readAllPages("o saldo anterior da ficha", (rangeFrom, rangeTo) =>
			inv
				.from("stock_movement")
				.select("id, type, quantity")
				.eq("kitchen_id", data.kitchenId)
				.eq("ingredient_id", data.ingredientId)
				.lt("created_at", from)
				.order("id")
				.range(rangeFrom, rangeTo)
		)
		let running = 0
		for (const move of before) running += isInflow(move.type) ? Number(move.quantity) : -Number(move.quantity)
		const opening = Number(running.toFixed(4))

		const moves = await readAllPages("a ficha", (rangeFrom, rangeTo) =>
			inv
				.from("stock_movement")
				.select("id, type, quantity, unit_cost, total_cost, justification, created_at, lot_id")
				.eq("kitchen_id", data.kitchenId)
				.eq("ingredient_id", data.ingredientId)
				.gte("created_at", from)
				.lt("created_at", to)
				.order("created_at", { ascending: true })
				.order("id")
				.range(rangeFrom, rangeTo)
		)

		const entries = moves.map((move) => {
			running += isInflow(move.type) ? Number(move.quantity) : -Number(move.quantity)
			return { ...move, running: Number(running.toFixed(4)) }
		})
		return { opening, entries }
	})

/** Exportação por CATMAT (SIAFI/SIADS): agrega o balancete pelo item de compra default. */
export const exportCatmatCsvFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), competencia: competenciaSchema }))
	.handler(async ({ data }): Promise<string> => {
		const ctx = await requireStorageForKitchen(1, data.kitchenId)
		await assertNoBlindCountHides(data.kitchenId, ctx, "A exportação")
		const balancete = await fetchBalanceteFn({ data })

		const ingredientIds = balancete.map((row) => row.ingredientId).filter((id): id is string => id != null)
		const catmatByIngredient = new Map<string, { codigo: number | null; descricao: string | null }>()
		if (ingredientIds.length > 0) {
			const proc = getServerClient("procurement")
			const links = await readAllPagesIn("o CATMAT dos itens", ingredientIds, (chunk, rangeFrom, rangeTo) =>
				proc
					.from("purchase_item_ingredient")
					.select("id, ingredient_id, purchase_item:purchase_item_id (catmat_item_codigo, catmat_item_descricao)")
					.in("ingredient_id", chunk)
					.eq("is_default", true)
					.order("id")
					.range(rangeFrom, rangeTo)
			)
			for (const link of links) {
				catmatByIngredient.set(link.ingredient_id, {
					codigo: link.purchase_item?.catmat_item_codigo ?? null,
					descricao: link.purchase_item?.catmat_item_descricao ?? null,
				})
			}
		}

		// `csvRow` neutraliza fórmula além de escapar aspas: descrição de CATMAT e de item são
		// texto de sistema externo/usuário, e a planilha executaria um `=` no início.
		const lines = [csvRow(["catmat_codigo", "catmat_descricao", "item", "unidade", "saldo_inicial", "entradas", "saidas", "saldo_final", "valor_final"], ";")]
		// itens COM catmat primeiro; sem catmat em seção separada no fim (spec)
		const withCatmat = balancete.filter((row) => row.ingredientId != null && catmatByIngredient.get(row.ingredientId)?.codigo != null)
		const withoutCatmat = balancete.filter((row) => !(row.ingredientId != null && catmatByIngredient.get(row.ingredientId)?.codigo != null))
		for (const row of [...withCatmat, ...withoutCatmat]) {
			const catmat = row.ingredientId ? catmatByIngredient.get(row.ingredientId) : null
			lines.push(
				csvRow(
					[
						catmat?.codigo ?? "",
						catmat?.descricao ?? (catmat?.codigo == null ? "SEM CATMAT" : ""),
						row.description,
						row.measureUnit ?? "",
						row.openQty.toFixed(4),
						row.inQty.toFixed(4),
						row.outQty.toFixed(4),
						row.finalQty.toFixed(4),
						row.finalVal.toFixed(4),
					],
					";"
				)
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
		const kitchenDb = getServerClient("kitchen")
		const finance = getServerClient("finance")

		const { data: kitchenRow, error: kitchenError } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).single()
		if (kitchenError) throw new Error(`Erro ao carregar a cozinha: ${publicDbMessage(kitchenError)}`)
		const unitId = kitchenRow?.purchase_unit_id ?? kitchenRow?.unit_id
		if (unitId == null) return []

		const { data: empenhos, error: empenhosError } = await finance
			.from("empenho")
			.select("id, numero_empenho, valor_total, status")
			.eq("unit_id", unitId)
			.eq("status", "ativo")
			.order("data_empenho", { ascending: false })
			.limit(100)
		if (empenhosError) throw new Error(`Erro ao ler os empenhos: ${publicDbMessage(empenhosError)}`)
		const list = empenhos ?? []
		const empenhoIds = list.map((e) => e.id)
		if (list.length === 0) return []

		// Quantidade empenhada pelos ITENS da NE (`finance.empenho_item`), só quando eles falam da
		// mesma coisa: itens em unidades diferentes (quilo com litro) ou só por valor (estimativa/
		// global) não somam, e a tela mostra "—" em vez de um "a receber" sem sentido.
		const neItems = await readAllPagesIn("os itens dos empenhos", empenhoIds, (chunk, rangeFrom, rangeTo) =>
			finance.from("empenho_item").select("id, empenho_id, quantity, unit").in("empenho_id", chunk).order("id").range(rangeFrom, rangeTo)
		)
		const itemsByEmpenho = new Map<string, Array<{ quantity: number | string | null; unit: string | null }>>()
		for (const item of neItems) {
			itemsByEmpenho.set(item.empenho_id, [...(itemsByEmpenho.get(item.empenho_id) ?? []), item])
		}

		// Recebida a menos é "a receber" a mais, sem erro nenhum: toda leitura daqui lança e pagina.
		const receipts = await readAllPagesIn("os recebimentos dos empenhos", empenhoIds, (chunk, rangeFrom, rangeTo) =>
			inv.from("goods_receipt").select("id, empenho_id").in("empenho_id", chunk).not("definitive_at", "is", null).order("id").range(rangeFrom, rangeTo)
		)
		const receiptItems = await readAllPagesIn(
			"os itens recebidos",
			receipts.map((r) => r.id),
			(chunk, rangeFrom, rangeTo) =>
				inv.from("goods_receipt_item").select("id, receipt_id, received_qty_base").in("receipt_id", chunk).order("id").range(rangeFrom, rangeTo)
		)
		const empenhoByReceipt = new Map(receipts.map((r) => [r.id, r.empenho_id]))
		const receivedByEmpenho = new Map<string, number>()
		for (const item of receiptItems) {
			const empenhoId = empenhoByReceipt.get(item.receipt_id)
			if (!empenhoId) continue
			receivedByEmpenho.set(empenhoId, (receivedByEmpenho.get(empenhoId) ?? 0) + Number(item.received_qty_base))
		}

		return list.map((empenho) => {
			const received = Number((receivedByEmpenho.get(empenho.id) ?? 0).toFixed(4))
			const empenhada = committedQuantity(itemsByEmpenho.get(empenho.id) ?? [])
			return {
				empenhoId: empenho.id,
				numeroEmpenho: empenho.numero_empenho,
				empenhada,
				recebida: received,
				aReceber: empenhada == null ? null : Number((empenhada - received).toFixed(4)),
				valorTotal: Number(empenho.valor_total),
			}
		})
	})
