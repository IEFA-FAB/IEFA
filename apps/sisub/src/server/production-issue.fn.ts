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

import { hasPermission } from "@iefa/pbac"
import {
	brasiliaDate,
	brasiliaToday,
	computeTheoreticalConsumption,
	type LotBalance,
	leftoverExpiryDate,
	pendingIssueWindowStart,
	type RecipeSnapshotForIssue,
	remainingAfterLateIssues,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { hiddenByBlindCount } from "@/lib/blind-count.server"
import { maskBlindCountIssueLines } from "@/lib/blind-count-mask"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient, toLooseRpcClient } from "@/lib/supabase.server"

const inventory = () => getServerClient("inventory")
const kitchen = () => getServerClient("kitchen")

interface TaskWithSnapshot {
	id: string
	production_date: string
	status: string
	menu_item: { recipe: RecipeSnapshotForIssue | null; planned_portion_quantity: number | null }
}

async function fetchTask(taskId: string): Promise<{ task: TaskWithSnapshot; kitchenId: number }> {
	const kit = kitchen()
	const { data: task, error } = await kit.from("production_task").select("id, kitchen_id, production_date, status, menu_item_id").eq("id", taskId).single()
	if (error || !task) throw new Error("Tarefa de produção não encontrada")
	// Leitura que falha não vira "tarefa sem ficha": seguir com `menu_item` nulo baixava a tarefa
	// com consumo teórico vazio.
	const { data: menuItem, error: menuError } = await kit.from("menu_items").select("recipe, planned_portion_quantity").eq("id", task.menu_item_id).maybeSingle()
	if (menuError) throw new Error(`Erro ao carregar a preparação da tarefa: ${menuError.message}`)
	if (!menuItem) throw new Error("A preparação desta tarefa não está mais no cardápio")
	return {
		// `recipe` é o snapshot jsonb gravado no cardápio; o tipo gerado o declara `Json`.
		task: { ...task, menu_item: { ...menuItem, recipe: menuItem.recipe as RecipeSnapshotForIssue | null } },
		kitchenId: Number(task.kitchen_id),
	}
}

async function lotBalancesForIngredients(kitchenId: number, ingredientIds: string[]): Promise<Map<string, LotBalance[]>> {
	const byIngredient = new Map<string, LotBalance[]>()
	if (ingredientIds.length === 0) return byIngredient
	const inv = inventory()
	const { data: rows } = await inv
		.from("v_stock_balance")
		.select("ingredient_id, lot_id, expiry_date, balance")
		.eq("kitchen_id", kitchenId)
		.in("ingredient_id", ingredientIds)

	// A view é a soma do ledger e não conhece o lote: nem quarentena, nem
	// entrada, nem "usar primeiro". Os três campos decidem a alocação no banco,
	// e a prévia sem eles mostra outro lote:
	//  • quarentena — a alocação PULA o lote, e contá-lo aqui faria a tela dizer
	//    "tem saldo" enquanto a baixa sai inteira como movimento sem lote:
	//    estoque negativo, sem nenhum aviso;
	//  • entrada — lote sem validade entra na fila por ela, e não no fim;
	//  • "usar primeiro" — o lote marcado no painel de vencimentos FURA a fila,
	//    e é o único jeito de o operador mandar sair o lote já aberto antes do
	//    lote de validade menor.
	// Só lote COM saldo. A view traz todo lote que a cozinha já teve, inclusive os
	// vazios; em alguns meses seriam centenas de ids num `.in(...)` via GET, a URL
	// estoura, e a leitura — que agora lança erro — derrubaria a tela inteira.
	const lotIds = [...new Set((rows ?? []).flatMap((row) => (row.lot_id != null && Number(row.balance) > 0 ? [row.lot_id] : [])))]
	const lotMeta = new Map<string, { quarantined_at: string | null; received_at: string | null; use_first: boolean | null }>()
	if (lotIds.length > 0) {
		const { data: lots, error: lotError } = await inv.from("stock_lot").select("id, quarantined_at, received_at, use_first").in("id", lotIds)
		// Sem esta leitura o lote em quarentena volta a contar como disponível, e a
		// tela diz que há saldo que o banco vai pular — o defeito que esta consulta
		// existe para fechar, de volta e calado.
		if (lotError) throw new Error(`Erro ao carregar os lotes: ${lotError.message}`)
		for (const lot of lots ?? []) lotMeta.set(lot.id, lot)
	}

	for (const row of rows ?? []) {
		// `ingredient_id` da view vem declarado anulável, mas a leitura filtra por ele.
		if (row.lot_id == null || row.ingredient_id == null || Number(row.balance) <= 0) continue
		const meta = lotMeta.get(row.lot_id)
		if (meta?.quarantined_at != null) continue
		const list = byIngredient.get(row.ingredient_id) ?? []
		list.push({
			lotId: row.lot_id,
			balance: Number(row.balance),
			expiryDate: row.expiry_date,
			receivedAt: meta?.received_at ?? null,
			useFirst: meta?.use_first ?? false,
		})
		byIngredient.set(row.ingredient_id, list)
	}
	return byIngredient
}

/** Teto de tarefas por leitura: a suficiência é calculada por tarefa. */
const PENDING_ISSUES_LIMIT = 300

/**
 * Primeiro dia da competência ABERTA da cozinha (fechamento mensal), e não mais "30 dias atrás":
 * a tarefa do mês aberto some da lista só quando o fechamento a torna imbaixável.
 */
async function openPeriodStart(kitchenId: number): Promise<string> {
	const inv = inventory()
	const [{ data: closing, error: closingError }, { data: first, error: firstError }] = await Promise.all([
		inv.from("monthly_closing").select("competencia").eq("kitchen_id", kitchenId).order("competencia", { ascending: false }).limit(1).maybeSingle(),
		inv.from("stock_movement").select("occurred_at").eq("kitchen_id", kitchenId).order("occurred_at", { ascending: true }).limit(1).maybeSingle(),
	])
	if (closingError) throw new Error(`Erro ao ler o fechamento mensal: ${closingError.message}`)
	if (firstError) throw new Error(`Erro ao ler o início do estoque: ${firstError.message}`)
	return pendingIssueWindowStart({
		lastClosedCompetencia: closing?.competencia ?? null,
		firstMovementDate: first?.occurred_at ? brasiliaDate(String(first.occurred_at)) : null,
		today: brasiliaToday(),
	})
}

/** Tarefas DONE da competência aberta ainda sem baixa, com suficiência de estoque. */
export const fetchPendingIssuesFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const ctx = await requireStorageForKitchen(1, data.kitchenId)
		const kit = kitchen()
		const inv = inventory()
		// Tela de OPERAÇÃO para quem confirma a baixa (nível 2): vê o disponível, como a saída e o
		// ajuste (`fetchStockBalanceFn` com `operation`). Quem só lê (nível 1) não vê o disponível
		// do insumo em contagem cega aberta — seria mais uma tela de onde ler o esperado.
		const hidden = hasPermission(ctx.permissions, "storage", 2, { type: "kitchen", id: data.kitchenId })
			? new Set<string>()
			: await hiddenByBlindCount(data.kitchenId, ctx)

		const since = await openPeriodStart(data.kitchenId)
		const { data: tasks, error } = await kit
			.from("production_task")
			.select("id, menu_item_id, production_date, status")
			.eq("kitchen_id", data.kitchenId)
			.eq("status", "DONE")
			.gte("production_date", since)
			.order("production_date", { ascending: false })
			.limit(PENDING_ISSUES_LIMIT)
		if (error) throw new Error(`Erro ao listar tarefas: ${error.message}`)
		const taskList = tasks ?? []
		if (taskList.length === 0) return []

		const { data: issued, error: issuedError } = await inv
			.from("stock_movement")
			.select("production_task_id, ingredient_id, quantity, is_late_issue")
			.eq("type", "production_issue")
			.in(
				"production_task_id",
				taskList.map((t) => t.id)
			)
		if (issuedError) throw new Error(`Erro ao conferir as baixas das tarefas: ${issuedError.message}`)
		// Baixada é a tarefa com saída que NÃO é tardia. A saída tardia ligada à tarefa é de um
		// insumo: a baixa segue pendente, com o que já saiu tarde descontado por insumo.
		const issuedIds = new Set<string>()
		const lateByTask = new Map<string, Map<string, number>>()
		for (const move of issued ?? []) {
			// `production_task_id` nunca vem nulo: a consulta filtra por ele.
			if (move.production_task_id == null) continue
			if (!move.is_late_issue) {
				issuedIds.add(move.production_task_id)
				continue
			}
			if (move.ingredient_id == null) continue
			const byIngredient = lateByTask.get(move.production_task_id) ?? new Map<string, number>()
			byIngredient.set(move.ingredient_id, (byIngredient.get(move.ingredient_id) ?? 0) + Number(move.quantity))
			lateByTask.set(move.production_task_id, byIngredient)
		}
		const pending = taskList.filter((t) => !issuedIds.has(t.id))
		if (pending.length === 0) return []

		const { data: menuItems } = await kit
			.from("menu_items")
			.select("id, recipe, planned_portion_quantity")
			.in(
				"id",
				pending.map((t) => t.menu_item_id)
			)
		const menuById = new Map((menuItems ?? []).map((m) => [m.id, m]))

		const results = []
		for (const task of pending) {
			const menuItem = menuById.get(task.menu_item_id) as { recipe: RecipeSnapshotForIssue | null; planned_portion_quantity: number | null } | undefined
			const theoretical = remainingAfterLateIssues(
				computeTheoreticalConsumption(menuItem?.recipe ?? null, Number(menuItem?.planned_portion_quantity ?? 0)),
				lateByTask.get(task.id) ?? new Map()
			)
			const balances = await lotBalancesForIngredients(
				data.kitchenId,
				theoretical.map((t) => t.ingredientId)
			)
			const today = brasiliaToday()
			const lines = maskBlindCountIssueLines(
				theoretical.map((line) => {
					const lots = balances.get(line.ingredientId) ?? []
					// lote vencido não conta como disponível: ele não vai ser alocado
					const available = lots.reduce((acc, lot) => (lot.expiryDate != null && lot.expiryDate < today ? acc : acc + lot.balance), 0)
					return { ...line, available: available as number | null, sufficient: (available >= line.quantity) as boolean | null }
				}),
				hidden
			)
			results.push({
				taskId: task.id,
				productionDate: task.production_date,
				recipeName: (menuItem?.recipe as { name?: string } | null)?.name ?? "(sem nome)",
				lines,
				sufficient: lines.filter((l) => l.sufficient === true).length,
				total: lines.length,
				/** Linhas sem disponível porque o insumo está numa contagem cega aberta. */
				blindCountLines: lines.filter((l) => l.isInBlindCount).length,
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
			taskId: z.uuid(),
			items: z
				.array(
					z.object({
						ingredientId: z.uuid(),
						quantity: z.number().positive(),
						overrideLotId: z.uuid().optional(),
						justification: z.string().optional(),
					})
				)
				.min(1),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { task, kitchenId } = await fetchTask(data.taskId)
		const { userId } = await requireStorageForKitchen(2, kitchenId)
		// baixa só de produção CONCLUÍDA — task PENDING/IN_PROGRESS não desconta (review)
		if (task.status !== "DONE") throw new Error(`Tarefa ainda não concluída (status ${task.status}) — conclua a produção antes da baixa`)

		const lines = data.items.map((item) => {
			if (item.overrideLotId && !item.justification?.trim()) {
				throw new Error("Override de lote (fora do FEFO) exige justificativa")
			}
			return {
				kitchen_id: kitchenId,
				ingredient_id: item.ingredientId,
				quantity: item.quantity,
				override_lot_id: item.overrideLotId ?? null,
				justification: item.justification?.trim() || null,
			}
		})

		// efetivação atômica no banco: advisory lock por tarefa, recheck e
		// ALOCAÇÃO dos lotes dentro da transação. Alocar aqui fora lia saldo sem
		// lock — duas baixas simultâneas do mesmo lote o deixavam negativo — e o
		// FEFO em memória escolhia lote vencido (review adversarial).
		const { data: result, error } = await inv.rpc("register_production_issue", {
			p_task_id: data.taskId,
			p_lines: lines,
			p_user: userId,
		})
		if (error) throw new Error(`Erro ao registrar baixa: ${error.message}`)
		return { movements: Number(result?.[0]?.movements ?? lines.length) }
	})

/**
 * Sobra reaproveitável → lote de PREPARAÇÃO CONGELADA (validade = shelf_life_days).
 *
 * Congelada que não está no catálogo (só a SDAB cadastra) não trava a sobra: `newFrozenPreparation`
 * cria uma PROVISÓRIA da cozinha, na mesma transação da sobra, e ela fica pendente de revisão
 * da SDAB. Sem isso, a sobra de estrogonofe das 14h ia para o caderno.
 */
export const registerLeftoverFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				taskId: z.uuid(),
				frozenPreparationId: z.uuid().optional(),
				newFrozenPreparation: z
					.object({
						description: z.string().trim().min(3, "Nome com ao menos 3 letras").max(120),
						shelfLifeDays: z.number().int().positive().max(3650).optional(),
						measureUnit: z.string().trim().max(20).optional(),
					})
					.optional(),
				quantity: z.number().positive(),
				discard: z.boolean().default(false),
				discardReason: z.string().optional(),
			})
			.refine((input) => (input.frozenPreparationId == null) !== (input.newFrozenPreparation == null), {
				message: "Escolha a preparação congelada ou informe o nome de uma nova — uma das duas",
				path: ["frozenPreparationId"],
			})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const kit = kitchen()
		const { task, kitchenId } = await fetchTask(data.taskId)
		const { userId } = await requireStorageForKitchen(2, kitchenId)

		if (data.discard && !data.discardReason?.trim()) throw new Error("Descarte exige motivo")

		if (data.newFrozenPreparation) {
			// Cria (ou reaproveita pelo nome) e registra numa transação: sem congelada órfã no retry.
			// `p_measure_unit`, `p_shelf_life_days` e `p_reason` não têm default no SQL e aceitam nulo:
			// o tipo gerado os declara não nulos, então esta RPC vai pela porta frouxa.
			const { data: result, error } = await toLooseRpcClient(inv).rpc("register_leftover_provisional", {
				p_kitchen_id: kitchenId,
				p_description: data.newFrozenPreparation.description,
				p_measure_unit: data.newFrozenPreparation.measureUnit ?? null,
				p_shelf_life_days: data.newFrozenPreparation.shelfLifeDays ?? null,
				p_lot_code: `SOBRA-${task.production_date}`,
				p_production_date: task.production_date,
				p_quantity: data.quantity,
				p_task_id: data.taskId,
				p_discard: data.discard,
				p_reason: data.discardReason?.trim() ?? null,
				p_user: userId,
			})
			if (error) throw new Error(`Erro ao registrar sobra: ${error.message}`)
			return { lotId: (result?.[0]?.lot_id as string) ?? null, discarded: data.discard, provisional: true }
		}

		// O `refine` do validador garante a congelada quando não há provisória nova.
		const frozenPreparationId = data.frozenPreparationId
		if (!frozenPreparationId) throw new Error("Preparação congelada não encontrada")
		const { data: prep } = await kit.from("frozen_preparation").select("id, shelf_life_days").eq("id", frozenPreparationId).single()
		if (!prep) throw new Error("Preparação congelada não encontrada")

		// lote + movimentos numa função SQL (review: falha parcial deixava lote
		// órfão e retry duplicava o retorno)
		// `p_reason` não tem default no SQL e é nulo sem descarte: ver `toLooseRpcClient`.
		const { data: result, error } = await toLooseRpcClient(inv).rpc("register_leftover", {
			p_kitchen_id: kitchenId,
			p_frozen_preparation_id: frozenPreparationId,
			p_lot_code: `SOBRA-${task.production_date}`,
			p_expiry_date: leftoverExpiryDate(task.production_date, prep.shelf_life_days),
			p_quantity: data.quantity,
			p_task_id: data.taskId,
			p_discard: data.discard,
			p_reason: data.discardReason?.trim() ?? null,
			p_user: userId,
		})
		if (error) throw new Error(`Erro ao registrar sobra: ${error.message}`)
		return { lotId: (result?.[0]?.lot_id as string) ?? null, discarded: data.discard, provisional: false }
	})

/**
 * Preparações congeladas disponíveis para destino de sobra: o catálogo e as provisórias DESTA
 * cozinha ainda não revisadas (as de outra cozinha só entram depois da SDAB).
 */
export const listFrozenPreparationsLiteFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data: input }) => {
		await requireStorageForKitchen(1, input.kitchenId)
		const { data, error } = await kitchen()
			.from("frozen_preparation")
			.select("id, description, shelf_life_days, provisional_since, provisional_reviewed_at")
			.is("deleted_at", null)
			.or(`provisional_since.is.null,provisional_reviewed_at.not.is.null,provisional_kitchen_id.eq.${input.kitchenId}`)
			.order("description")
			.limit(500)
		if (error) throw new Error(`Erro ao listar preparações: ${error.message}`)
		return (data ?? []).map((row) => ({
			id: row.id,
			description: row.description,
			shelf_life_days: row.shelf_life_days,
			provisional: row.provisional_since != null && row.provisional_reviewed_at == null,
		}))
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
		await requireStorageForKitchen(1, data.kitchenId)
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
					taskList.map((t) => t.menu_item_id)
				)
			const menuById = new Map((menuItems ?? []).map((m) => [m.id, m]))
			// por TAREFA, não por menu_item deduplicado — a mesma preparação
			// produzida N vezes conta N vezes (review: variância superestimada)
			for (const taskRow of taskList) {
				const menuItem = menuById.get(taskRow.menu_item_id)
				if (!menuItem) continue
				for (const line of computeTheoreticalConsumption(
					menuItem.recipe as Parameters<typeof computeTheoreticalConsumption>[0],
					Number(menuItem.planned_portion_quantity ?? 0)
				)) {
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
			// o período é civil (Brasília): sem o offset, saída das 22:30 do
			// último dia do mês caía no mês seguinte
			.gte("occurred_at", `${data.from}T00:00:00-03:00`)
			.lte("occurred_at", `${data.to}T23:59:59.999-03:00`)
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
