/**
 * @module production-issue.fn
 * Baixa por produção (Fase 5): consumo teórico do SNAPSHOT `menu_items.recipe`
 * (nunca a receita viva), alocação FEFO multi-lote, sobras (retorno como
 * preparação congelada / descarte documentado) e variância teórico × real.
 * CLIENT: getServerClient (service role, schemas inventory/kitchen).
 * AUTH: `storage` nível 1 leitura, 2 confirmar baixa/sobra.
 * TABLES: inventory.stock_movement/stock_lot, kitchen.production_task/menu_items.
 * @domain kitchen
 * @migration 20260729160000_inventory_stock_core
 */

import { allocateFefo, computeTheoreticalConsumption, type LotBalance, leftoverExpiryDate, type RecipeSnapshotForIssue } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

interface TaskWithSnapshot {
	id: string
	production_date: string
	status: string
	menu_item: { recipe: RecipeSnapshotForIssue | null; planned_portion_quantity: number | null } | null
}

async function fetchTask(taskId: string): Promise<{ task: TaskWithSnapshot; kitchenId: number }> {
	const kit = kitchen()
	const { data: task, error } = await kit.from("production_task").select("id, kitchen_id, production_date, status, menu_item_id").eq("id", taskId).single()
	if (error || !task) throw new Error("Tarefa de produção não encontrada")
	const { data: menuItem } = await kit.from("menu_items").select("recipe, planned_portion_quantity").eq("id", task.menu_item_id).single()
	return {
		task: { ...task, menu_item: menuItem ?? null },
		kitchenId: Number(task.kitchen_id),
	}
}

async function lotBalancesForIngredients(kitchenId: number, ingredientIds: string[]): Promise<Map<string, LotBalance[]>> {
	const byIngredient = new Map<string, LotBalance[]>()
	if (ingredientIds.length === 0) return byIngredient
	const { data: rows } = await inventory()
		.from("v_stock_balance")
		.select("ingredient_id, lot_id, expiry_date, balance")
		.eq("kitchen_id", kitchenId)
		.in("ingredient_id", ingredientIds)
	for (const row of rows ?? []) {
		if (row.lot_id == null || Number(row.balance) <= 0) continue
		const list = byIngredient.get(row.ingredient_id) ?? []
		list.push({ lotId: row.lot_id, balance: Number(row.balance), expiryDate: row.expiry_date })
		byIngredient.set(row.ingredient_id, list)
	}
	return byIngredient
}

/** Tarefas DONE dos últimos 30 dias ainda sem baixa, com suficiência de estoque. */
export const fetchPendingIssuesFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const kit = kitchen()
		const inv = inventory()

		const since = new Date(Date.now() - 30 * 86_400_000).toISOString().substring(0, 10)
		const { data: tasks, error } = await kit
			.from("production_task")
			.select("id, menu_item_id, production_date, status")
			.eq("kitchen_id", data.kitchenId)
			.eq("status", "DONE")
			.gte("production_date", since)
			.order("production_date", { ascending: false })
		if (error) throw new Error(`Erro ao listar tarefas: ${error.message}`)
		const taskList = tasks ?? []
		if (taskList.length === 0) return []

		const { data: issued } = await inv
			.from("stock_movement")
			.select("production_task_id")
			.eq("type", "production_issue")
			.in(
				"production_task_id",
				taskList.map((t: { id: string }) => t.id)
			)
		const issuedIds = new Set((issued ?? []).map((m: { production_task_id: string }) => m.production_task_id))
		const pending = taskList.filter((t: { id: string }) => !issuedIds.has(t.id))
		if (pending.length === 0) return []

		const { data: menuItems } = await kit
			.from("menu_items")
			.select("id, recipe, planned_portion_quantity")
			.in(
				"id",
				pending.map((t: { menu_item_id: string }) => t.menu_item_id)
			)
		const menuById = new Map((menuItems ?? []).map((m: { id: string }) => [m.id, m]))

		const results = []
		for (const task of pending) {
			const menuItem = menuById.get(task.menu_item_id) as { recipe: RecipeSnapshotForIssue | null; planned_portion_quantity: number | null } | undefined
			const theoretical = computeTheoreticalConsumption(menuItem?.recipe ?? null, Number(menuItem?.planned_portion_quantity ?? 0))
			const balances = await lotBalancesForIngredients(
				data.kitchenId,
				theoretical.map((t) => t.ingredientId)
			)
			const lines = theoretical.map((line) => {
				const lots = balances.get(line.ingredientId) ?? []
				const available = lots.reduce((acc, lot) => acc + lot.balance, 0)
				return { ...line, available, sufficient: available >= line.quantity }
			})
			results.push({
				taskId: task.id,
				productionDate: task.production_date,
				recipeName: (menuItem?.recipe as { name?: string } | null)?.name ?? "(sem nome)",
				lines,
				sufficient: lines.filter((l) => l.sufficient).length,
				total: lines.length,
			})
		}
		return results
	})

/**
 * Confirma a baixa: aloca FEFO por ingrediente (override de lote exige
 * justificativa) e grava TODOS os movimentos em um insert (uma request =
 * uma transação). Tarefa já baixada não baixa de novo.
 */
export const confirmIssueFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			taskId: z.string().uuid(),
			items: z
				.array(
					z.object({
						ingredientId: z.string().uuid(),
						quantity: z.number().positive(),
						overrideLotId: z.string().uuid().optional(),
						justification: z.string().optional(),
					})
				)
				.min(1),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireAuthWithPermission("storage", 2)
		const inv = inventory()
		const { kitchenId } = await fetchTask(data.taskId)

		const { data: existing } = await inv.from("stock_movement").select("id").eq("production_task_id", data.taskId).eq("type", "production_issue").limit(1)
		if ((existing ?? []).length > 0) throw new Error("Esta tarefa já teve baixa de estoque registrada")

		const balances = await lotBalancesForIngredients(
			kitchenId,
			data.items.map((item) => item.ingredientId)
		)

		const movements: Record<string, unknown>[] = []
		for (const item of data.items) {
			const lots = balances.get(item.ingredientId) ?? []
			if (item.overrideLotId) {
				if (!item.justification?.trim()) throw new Error("Override de lote (fora do FEFO) exige justificativa")
				movements.push({
					kitchen_id: kitchenId,
					ingredient_id: item.ingredientId,
					lot_id: item.overrideLotId,
					type: "production_issue",
					quantity: item.quantity,
					justification: item.justification.trim(),
					production_task_id: data.taskId,
					created_by: userId,
				})
				continue
			}
			const { allocations, shortfall } = allocateFefo(lots, item.quantity)
			for (const allocation of allocations) {
				movements.push({
					kitchen_id: kitchenId,
					ingredient_id: item.ingredientId,
					lot_id: allocation.lotId,
					type: "production_issue",
					quantity: allocation.quantity,
					production_task_id: data.taskId,
					created_by: userId,
				})
			}
			if (shortfall > 0) {
				// consumo real maior que o saldo em lotes: registra o excedente sem lote
				movements.push({
					kitchen_id: kitchenId,
					ingredient_id: item.ingredientId,
					lot_id: null,
					type: "production_issue",
					quantity: shortfall,
					justification: "Consumo além do saldo em lotes (estoque ficará negativo — verificar contagem)",
					production_task_id: data.taskId,
					created_by: userId,
				})
			}
		}

		const { error } = await inv.from("stock_movement").insert(movements)
		if (error) throw new Error(`Erro ao registrar baixa: ${error.message}`)
		return { movements: movements.length }
	})

/** Sobra reaproveitável → lote de PREPARAÇÃO CONGELADA (validade = shelf_life_days). */
export const registerLeftoverFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			taskId: z.string().uuid(),
			frozenPreparationId: z.string().uuid(),
			quantity: z.number().positive(),
			discard: z.boolean().default(false),
			discardReason: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireAuthWithPermission("storage", 2)
		const inv = inventory()
		const kit = kitchen()
		const { task, kitchenId } = await fetchTask(data.taskId)

		if (data.discard && !data.discardReason?.trim()) throw new Error("Descarte exige motivo")

		const { data: prep } = await kit.from("frozen_preparation").select("id, shelf_life_days").eq("id", data.frozenPreparationId).single()
		if (!prep) throw new Error("Preparação congelada não encontrada")

		const { data: lot, error: lotError } = await inv
			.from("stock_lot")
			.insert({
				kitchen_id: kitchenId,
				frozen_preparation_id: data.frozenPreparationId,
				lot_code: `SOBRA-${task.production_date}`,
				expiry_date: leftoverExpiryDate(task.production_date, prep.shelf_life_days),
			})
			.select("id")
			.single()
		if (lotError || !lot) throw new Error(`Erro ao criar lote de sobra: ${lotError?.message}`)

		const base = {
			kitchen_id: kitchenId,
			frozen_preparation_id: data.frozenPreparationId,
			lot_id: lot.id,
			quantity: data.quantity,
			production_task_id: data.taskId,
			created_by: userId,
		}
		// descarte: par retorno+descarte no MESMO insert (documenta a perda, saldo zero)
		const movements = data.discard
			? [
					{ ...base, type: "leftover_return", unit_cost: 0 },
					{ ...base, type: "waste", justification: data.discardReason?.trim() },
				]
			: [{ ...base, type: "leftover_return", unit_cost: 0 }]

		const { error } = await inv.from("stock_movement").insert(movements)
		if (error) throw new Error(`Erro ao registrar sobra: ${error.message}`)
		return { lotId: lot.id as string, discarded: data.discard }
	})

/** Preparações congeladas disponíveis para destino de sobra. */
export const listFrozenPreparationsLiteFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireAuthWithPermission("storage", 1)
	const { data, error } = await kitchen()
		.from("frozen_preparation")
		.select("id, description, shelf_life_days")
		.is("deleted_at", null)
		.order("description")
		.limit(200)
	if (error) throw new Error(`Erro ao listar preparações: ${error.message}`)
	return data ?? []
})

/** Variância teórico × real por ingrediente no período (default: mês corrente). */
export const fetchVarianceFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const kit = kitchen()
		const inv = inventory()

		const { data: tasks } = await kit
			.from("production_task")
			.select("id, menu_item_id")
			.eq("kitchen_id", data.kitchenId)
			.eq("status", "DONE")
			.gte("production_date", data.from)
			.lte("production_date", data.to)
		const taskList = tasks ?? []

		const theoretical = new Map<string, number>()
		if (taskList.length > 0) {
			const { data: menuItems } = await kit
				.from("menu_items")
				.select("id, recipe, planned_portion_quantity")
				.in(
					"id",
					taskList.map((t: { menu_item_id: string }) => t.menu_item_id)
				)
			for (const menuItem of menuItems ?? []) {
				for (const line of computeTheoreticalConsumption(menuItem.recipe, Number(menuItem.planned_portion_quantity ?? 0))) {
					theoretical.set(line.ingredientId, (theoretical.get(line.ingredientId) ?? 0) + line.quantity)
				}
			}
		}

		const real = new Map<string, number>()
		const { data: moves } = await inv
			.from("stock_movement")
			.select("ingredient_id, quantity")
			.eq("kitchen_id", data.kitchenId)
			.eq("type", "production_issue")
			.gte("created_at", `${data.from}T00:00:00Z`)
			.lte("created_at", `${data.to}T23:59:59Z`)
		for (const move of moves ?? []) {
			if (move.ingredient_id == null) continue
			real.set(move.ingredient_id, (real.get(move.ingredient_id) ?? 0) + Number(move.quantity))
		}

		const ingredientIds = [...new Set([...theoretical.keys(), ...real.keys()])]
		const names = new Map<string, { description: string | null; measure_unit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ings } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			for (const ing of ings ?? []) names.set(ing.id, ing)
		}

		return ingredientIds
			.map((id) => {
				const theo = Number((theoretical.get(id) ?? 0).toFixed(4))
				const actual = Number((real.get(id) ?? 0).toFixed(4))
				return {
					ingredientId: id,
					description: names.get(id)?.description ?? "—",
					measureUnit: names.get(id)?.measure_unit ?? null,
					theoretical: theo,
					real: actual,
					delta: Number((actual - theo).toFixed(4)),
					deltaPct: theo > 0 ? Number((((actual - theo) / theo) * 100).toFixed(1)) : null,
				}
			})
			.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
	})
