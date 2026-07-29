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

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient
const core = () => getServerClient("core") as unknown as LooseClient

export interface StockLotBalanceRow {
	lot_id: string | null
	lot_code: string | null
	expiry_date: string | null
	balance: number
	balance_value: number
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
			}
			item.balance += Number(row.balance ?? 0)
			item.balanceValue += Number(row.balance_value ?? 0)
			item.lots.push({
				lot_id: row.lot_id,
				lot_code: row.lot_code,
				expiry_date: row.expiry_date,
				balance: Number(row.balance ?? 0),
				balance_value: Number(row.balance_value ?? 0),
			})
			if (row.expiry_date && Number(row.balance ?? 0) > 0 && (item.nextExpiry == null || row.expiry_date < item.nextExpiry)) {
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

/**
 * Bloqueio da Fase 2a: ingrediente com unidade fora do catálogo canônico não
 * movimenta estoque — o erro aponta a fila de revisão.
 */
async function assertCanonicalUnit(ingredientId: string | null) {
	if (!ingredientId) return
	const { data: ing } = await kitchen().from("ingredient").select("description, measure_unit").eq("id", ingredientId).single()
	if (!ing?.measure_unit)
		throw new Error(
			`Insumo "${ing?.description ?? ingredientId}" sem unidade de medida — corrija na fila de revisão (/global/review-queues) antes de movimentar estoque`
		)
	const { data: unit } = await core().from("measure_unit").select("code").eq("code", ing.measure_unit).maybeSingle()
	if (!unit) {
		throw new Error(
			`Insumo "${ing.description}" tem unidade "${ing.measure_unit}" fora do catálogo canônico — resolva na fila de revisão (/global/review-queues) antes de movimentar estoque`
		)
	}
}

/**
 * Ajuste manual (entrada ou saída) com justificativa obrigatória. Para entrada
 * sem lote existente, cria o lote (sintético SEM-LOTE-<data> quando não
 * informado).
 */
export const createAdjustmentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			direction: z.enum(["in", "out"]),
			quantity: z.number().positive(),
			justification: z.string().min(5, "Justificativa obrigatória (mínimo 5 caracteres)"),
			lotId: z.string().uuid().optional(),
			newLot: z
				.object({
					ingredientId: z.string().uuid().optional(),
					frozenPreparationId: z.string().uuid().optional(),
					lotCode: z.string().optional(),
					expiryDate: z
						.string()
						.regex(/^\d{4}-\d{2}-\d{2}$/)
						.optional(),
					unitCost: z.number().nonnegative().optional(),
				})
				.optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const inv = inventory()

		let lot: { id: string; ingredient_id: string | null; frozen_preparation_id: string | null }
		if (data.lotId) {
			const { data: existing, error } = await inv
				.from("stock_lot")
				.select("id, ingredient_id, frozen_preparation_id")
				.eq("id", data.lotId)
				.eq("kitchen_id", data.kitchenId)
				.single()
			if (error || !existing) throw new Error("Lote não encontrado")
			lot = existing
		} else {
			if (!data.newLot || (!data.newLot.ingredientId && !data.newLot.frozenPreparationId)) {
				throw new Error("Informe um lote existente ou os dados do novo lote (com o item)")
			}
			if (data.direction === "out") throw new Error("Saída exige lote existente")
			await assertCanonicalUnit(data.newLot.ingredientId ?? null)
			const lotCode = data.newLot.lotCode?.trim() || `SEM-LOTE-${new Date().toISOString().substring(0, 10)}`
			const { data: created, error } = await inv
				.from("stock_lot")
				.insert({
					kitchen_id: data.kitchenId,
					ingredient_id: data.newLot.ingredientId ?? null,
					frozen_preparation_id: data.newLot.frozenPreparationId ?? null,
					lot_code: lotCode,
					expiry_date: data.newLot.expiryDate ?? null,
					unit_cost: data.newLot.unitCost ?? null,
				})
				.select("id, ingredient_id, frozen_preparation_id")
				.single()
			if (error || !created) throw new Error(`Erro ao criar lote: ${error?.message}`)
			lot = created
		}

		await assertCanonicalUnit(lot.ingredient_id)

		const { error: moveError } = await inv.from("stock_movement").insert({
			kitchen_id: data.kitchenId,
			ingredient_id: lot.ingredient_id,
			frozen_preparation_id: lot.frozen_preparation_id,
			lot_id: lot.id,
			type: data.direction === "in" ? "adjustment_in" : "adjustment_out",
			quantity: data.quantity,
			unit_cost: data.direction === "in" ? (data.newLot?.unitCost ?? null) : null,
			justification: data.justification.trim(),
			created_by: userId,
		})
		if (moveError) throw new Error(`Erro ao registrar ajuste: ${moveError.message}`)
		return { lotId: lot.id }
	})

/** Transferência atômica entre cozinhas (função SQL: par transfer_out/in). */
export const createTransferFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.string().uuid(), toKitchenId: z.number().int().positive(), quantity: z.number().positive() }))
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
	.validator(z.object({ countId: z.string().uuid(), lotId: z.string().uuid(), countedQty: z.number().nonnegative() }))
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
	.validator(z.object({ countId: z.string().uuid() }))
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
