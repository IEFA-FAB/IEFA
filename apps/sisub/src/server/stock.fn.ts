/**
 * @module stock.fn
 * Motor de estoque (Fase 3): saldo, movimentos, ajustes, transferência e
 * contagem física. O ledger é append-only (trigger no banco); custo médio
 * ponderado mantido por triggers; transferência/confirmação de contagem são
 * funções SQL (atômicas).
 * CLIENT: getServerClient (service role, schemas inventory/kitchen/core).
 * AUTH: `storage` nível 1 leitura, 2 movimentar, 3 ajustar/contar.
 * TABLES: inventory.stock_lot, stock_movement, stock_cost, inventory_count(_item).
 * @domain kitchen
 * @migration 20260729160000_inventory_stock_core
 */

import { brasiliaToday } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

export interface StockLotBalanceRow {
	lot_id: string | null
	lot_code: string | null
	expiry_date: string | null
	balance: number
	balance_value: number
	/** Código da etiqueta interna — null no saldo sem lote (falta de alocação). */
	short_code: string | null
	location: string | null
	use_first: boolean
	quarantined: boolean
	derivation: string | null
}

export interface StockBalanceItem {
	ingredientId: string | null
	frozenPreparationId: string | null
	description: string
	measureUnit: string | null
	balance: number
	balanceValue: number
	lots: StockLotBalanceRow[]
	nextExpiry: string | null
	/** Parte do saldo que está em quarentena — existe, mas não é alocável. */
	quarantinedBalance: number
	/**
	 * Saldo preso em lote VENCIDO.
	 *
	 * A alocação de saída pula lote vencido, exatamente como pula quarentena.
	 * Uma tela que desconta só a quarentena oferece saldo que o banco nunca vai
	 * tocar: o operador pede 20 KG, existem 20 KG "disponíveis" todos vencidos,
	 * e a baixa sai inteira como movimento sem lote — estoque negativo, sem
	 * nenhum aviso.
	 */
	expiredBalance: number
}

/** Nomes de itens (insumos + preparações congeladas) para exibição. */
async function describeItems(ingredientIds: string[], frozenIds: string[]) {
	const kit = kitchen()
	const names = new Map<string, { description: string; measureUnit: string | null }>()
	if (ingredientIds.length > 0) {
		const { data } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
		for (const row of data ?? []) names.set(`i:${row.id}`, { description: row.description ?? "(sem descrição)", measureUnit: row.measure_unit })
	}
	if (frozenIds.length > 0) {
		const { data } = await kit.from("frozen_preparation").select("id, description, measure_unit").in("id", frozenIds)
		for (const row of data ?? []) names.set(`f:${row.id}`, { description: row.description ?? "(sem descrição)", measureUnit: row.measure_unit })
	}
	return names
}

/** Saldo por item (com lotes) de uma cozinha, a partir da view do ledger. */
export const fetchStockBalanceFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<StockBalanceItem[]> => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()

		const { data: rows, error } = await inv.from("v_stock_balance").select("*").eq("kitchen_id", data.kitchenId)
		if (error) throw new Error(`Erro ao consultar saldo: ${error.message}`)

		// A view é a soma do ledger e não conhece o lote além do código: quarentena,
		// etiqueta, local e "usar primeiro" vêm da tabela. Sem isso a tela mostra
		// saldo de lote em quarentena como disponível — e ele não é alocável.
		const lotIds = [...new Set((rows ?? []).map((row: { lot_id: string | null }) => row.lot_id).filter(Boolean))] as string[]
		const lotMeta = new Map<
			string,
			{ short_code: string; location: string | null; use_first: boolean; quarantined_at: string | null; derivation: string | null }
		>()
		if (lotIds.length > 0) {
			const { data: lots } = await inv.from("stock_lot").select("id, short_code, location, use_first, quarantined_at, derivation").in("id", lotIds)
			for (const lot of lots ?? []) lotMeta.set(lot.id, lot)
		}

		const byItem = new Map<string, StockBalanceItem>()
		for (const row of rows ?? []) {
			const key = row.ingredient_id ? `i:${row.ingredient_id}` : `f:${row.frozen_preparation_id}`
			const item: StockBalanceItem = byItem.get(key) ?? {
				ingredientId: row.ingredient_id,
				frozenPreparationId: row.frozen_preparation_id,
				description: "",
				measureUnit: null,
				balance: 0,
				balanceValue: 0,
				lots: [],
				nextExpiry: null,
				quarantinedBalance: 0,
				expiredBalance: 0,
			}
			item.balance += Number(row.balance ?? 0)
			item.balanceValue += Number(row.balance_value ?? 0)
			const meta = row.lot_id ? lotMeta.get(row.lot_id) : undefined
			item.lots.push({
				lot_id: row.lot_id,
				lot_code: row.lot_code,
				expiry_date: row.expiry_date,
				balance: Number(row.balance ?? 0),
				balance_value: Number(row.balance_value ?? 0),
				short_code: meta?.short_code ?? null,
				location: meta?.location ?? null,
				use_first: meta?.use_first ?? false,
				quarantined: meta?.quarantined_at != null,
				derivation: meta?.derivation ?? null,
			})
			if (meta?.quarantined_at != null) item.quarantinedBalance += Number(row.balance ?? 0)
			// vencido na data civil de Brasília, como a alocação mede
			else if (row.expiry_date != null && row.expiry_date < brasiliaToday()) item.expiredBalance += Number(row.balance ?? 0)
			if (row.expiry_date && Number(row.balance ?? 0) > 0 && meta?.quarantined_at == null && (item.nextExpiry == null || row.expiry_date < item.nextExpiry)) {
				item.nextExpiry = row.expiry_date
			}
			byItem.set(key, item)
		}

		const names = await describeItems(
			[...byItem.values()].map((i) => i.ingredientId).filter((id): id is string => id != null),
			[...byItem.values()].map((i) => i.frozenPreparationId).filter((id): id is string => id != null)
		)
		for (const [key, item] of byItem) {
			const meta = names.get(key)
			item.description = meta?.description ?? key
			item.measureUnit = meta?.measureUnit ?? null
			item.lots.sort((a, b) => ((a.expiry_date ?? "9999") < (b.expiry_date ?? "9999") ? -1 : 1))
		}
		return [...byItem.values()].sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))
	})

/** Movimentos recentes de uma cozinha (com descrição do item). */
export const fetchStockMovementsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(50) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: rows, error } = await inventory()
			.from("stock_movement")
			.select("id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, total_cost, justification, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao consultar movimentos: ${error.message}`)

		const movements = rows ?? []
		const names = await describeItems(
			[...new Set(movements.map((m: { ingredient_id: string | null }) => m.ingredient_id).filter(Boolean))] as string[],
			[...new Set(movements.map((m: { frozen_preparation_id: string | null }) => m.frozen_preparation_id).filter(Boolean))] as string[]
		)
		return movements.map((m: Record<string, unknown>) => ({
			...m,
			description: names.get(m.ingredient_id ? `i:${m.ingredient_id}` : `f:${m.frozen_preparation_id}`)?.description ?? "—",
		}))
	})

// O ajuste manual saiu daqui: virou DOCUMENTO em `adjustment.fn.ts`, com motivo
// tipado, alçada e segregação checadas no banco. O que existia aqui criava o
// lote numa request e o movimento na outra — a falha da segunda deixava lote
// órfão — e gravava só texto livre, que não vira relatório de perdas.

/** Transferência atômica entre cozinhas (função SQL: par transfer_out/in). */
export const createTransferFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), toKitchenId: z.number().int().positive(), quantity: z.number().positive() }))
	.handler(async ({ data }) => {
		// escopo pela cozinha de ORIGEM do lote (quem cede precisa da permissão)
		const { data: lotRow } = await inventory().from("stock_lot").select("kitchen_id").eq("id", data.lotId).maybeSingle()
		if (!lotRow) throw new Error("Lote não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(lotRow.kitchen_id))
		const { data: result, error } = await inventory().rpc("transfer_stock", {
			p_lot_id: data.lotId,
			p_to_kitchen: data.toKitchenId,
			p_quantity: data.quantity,
			p_user: userId,
		})
		if (error) throw new Error(`Transferência falhou: ${error.message}`)
		return { transferPairId: result?.[0]?.transfer_pair_id ?? null }
	})

// ─── Contagem física ─────────────────────────────────────────────────────────

export const createInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ kitchenId: z.number().int().positive(), notes: z.string().optional() }))
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const { data: count, error } = await inventory()
			.from("inventory_count")
			.insert({ kitchen_id: data.kitchenId, notes: data.notes?.trim() || null, created_by: userId })
			.select("id")
			.single()
		if (error || !count) throw new Error(`Erro ao criar contagem: ${error?.message}`)
		return { countId: count.id as string }
	})

export const upsertCountItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), lotId: z.uuid(), countedQty: z.number().nonnegative() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("kitchen_id, status").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(3, Number(count.kitchen_id))
		if (count.status !== "draft") throw new Error("Contagem já confirmada")
		// lote precisa pertencer à cozinha da contagem (o confirm também valida no SQL)
		const { data: lot } = await inv.from("stock_lot").select("kitchen_id").eq("id", data.lotId).maybeSingle()
		if (!lot || Number(lot.kitchen_id) !== Number(count.kitchen_id)) throw new Error("Lote não pertence à cozinha desta contagem")
		const { error } = await inv
			.from("inventory_count_item")
			.upsert({ count_id: data.countId, lot_id: data.lotId, counted_qty: data.countedQty }, { onConflict: "count_id,lot_id" })
		if (error) throw new Error(`Erro ao registrar contagem do lote: ${error.message}`)
	})

/** Confirmação atômica: divergências viram ajustes vinculados à contagem. */
export const confirmInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: count } = await inventory().from("inventory_count").select("kitchen_id").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))
		const { data: result, error } = await inventory().rpc("confirm_inventory_count", { p_count_id: data.countId, p_user: userId })
		if (error) throw new Error(`Confirmação falhou: ${error.message}`)
		return { adjustments: Number(result?.[0]?.adjustments ?? 0) }
	})

export const fetchInventoryCountsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const { data: counts, error } = await inv
			.from("inventory_count")
			.select("id, status, notes, created_at, confirmed_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(20)
		if (error) throw new Error(`Erro ao listar contagens: ${error.message}`)

		const draft = (counts ?? []).find((c: { status: string }) => c.status === "draft")
		let draftItems: { lot_id: string; counted_qty: number }[] = []
		if (draft) {
			const { data: items } = await inv.from("inventory_count_item").select("lot_id, counted_qty").eq("count_id", draft.id)
			draftItems = items ?? []
		}
		return { counts: counts ?? [], draftItems }
	})
