/**
 * @module issue.fn
 * Saída de estoque do DIA: sugestão pela produção, emissão em qualquer
 * momento, devolução ao lote e fechamento com motivo.
 *
 * O desenho anterior amarrava a baixa a uma tarefa já concluída, uma vez só.
 * Na cozinha o material sai antes de cozinhar, em várias idas ao estoque, e o
 * que sobra fechado volta para a prateleira — por isso a requisição é do dia e
 * aceita emissões, devoluções e complementos.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen).
 * AUTH: `storage` nível 2 emite e fecha; nível 3 para lote vencido.
 * TABLES: inventory.stock_issue_request(_item), stock_movement, stock_lot.
 * @domain kitchen
 * @migration 20260917220000_stock_issue_request
 */

import {
	brasiliaToday,
	checkDayClosure,
	computeTheoreticalConsumption,
	ISSUE_VARIANCE_REASONS,
	type IssueLineForVariance,
	type RecipeSnapshotForIssue,
	roundToIssuePackage,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

/** Tolerâncias da cozinha, com os defaults do banco. */
async function toleranceFor(kitchenId: number) {
	const { data: row } = await inventory()
		.from("kitchen_stock_settings")
		.select("issue_tolerance_pct, issue_tolerance_floor_value")
		.eq("kitchen_id", kitchenId)
		.maybeSingle()
	return {
		tolerancePct: Number(row?.issue_tolerance_pct ?? 10),
		toleranceFloorValue: Number(row?.issue_tolerance_floor_value ?? 20),
	}
}

/**
 * Sugestão do dia: soma as tarefas cuja data de RETIRADA é o dia.
 *
 * A data de retirada é `issue_date` quando preenchida, senão a de produção. O
 * descongelamento é o caso que obriga a separar as duas: a carne do almoço de
 * quarta sai do estoque na terça, e amarrar à data de produção a jogaria na
 * requisição errada.
 *
 * A quantidade é a BRUTA (com fator de correção) — o que sai do estoque é o
 * peso antes da limpeza, não o líquido da receita — e sobe para a embalagem de
 * saída do item quando ele tem uma.
 */
async function computeSuggestion(kitchenId: number, issueDate: string) {
	const kit = kitchen()
	// A ordem importa e não é enfeite: sem `order by` o PostgREST devolve as
	// tarefas na ordem que o planner quiser, e como a refeição do insumo é a da
	// PRIMEIRA tarefa que o cita, a mesma sugestão saía ora "Almoço" ora
	// "Jantar" entre dois carregamentos da mesma tela.
	const { data: tasks, error: taskError } = await kit
		.from("production_task")
		.select("id, menu_item_id, production_date, issue_date, status")
		.eq("kitchen_id", kitchenId)
		.or(`issue_date.eq.${issueDate},and(issue_date.is.null,production_date.eq.${issueDate})`)
		.order("production_date", { ascending: true })
		.order("id", { ascending: true })
	if (taskError) throw new Error(`Erro ao carregar as tarefas do dia: ${taskError.message}`)
	const taskList = (tasks ?? []) as Array<{ id: string; menu_item_id: string }>
	if (taskList.length === 0) return { lines: [], taskIds: [] as string[] }

	// `meal_type_id` está em `daily_menu`, NÃO em `menu_items`: pedi-lo aqui fazia
	// o PostgREST devolver erro, o erro era descartado e a sugestão voltava
	// sempre vazia — o recurso inteiro (variância, justificativa, fechamento)
	// nascia morto sem nenhum sinal na tela.
	const { data: menuItems, error: menuError } = await kit
		.from("menu_items")
		.select("id, recipe, planned_portion_quantity, daily_menu_id")
		.in(
			"id",
			taskList.map((task) => task.menu_item_id)
		)
	if (menuError) throw new Error(`Erro ao carregar o cardápio do dia: ${menuError.message}`)

	const dailyMenuIds = [...new Set((menuItems ?? []).map((item: { daily_menu_id: string | null }) => item.daily_menu_id).filter(Boolean))] as string[]
	const mealTypeByMenu = new Map<string, string | null>()
	if (dailyMenuIds.length > 0) {
		const { data: dailyMenus, error: menuTypeError } = await kit.from("daily_menu").select("id, meal_type_id").in("id", dailyMenuIds)
		if (menuTypeError) throw new Error(`Erro ao carregar as refeições do dia: ${menuTypeError.message}`)
		for (const menu of dailyMenus ?? []) mealTypeByMenu.set(menu.id, menu.meal_type_id ?? null)
	}

	const menuById = new Map((menuItems ?? []).map((item: { id: string }) => [item.id, item]))

	const totals = new Map<string, { quantity: number; mealTypeId: string | null }>()
	for (const task of taskList) {
		const menuItem = menuById.get(task.menu_item_id) as
			| { recipe: RecipeSnapshotForIssue | null; planned_portion_quantity: number | null; daily_menu_id: string | null }
			| undefined
		if (!menuItem) continue
		const mealTypeId = menuItem.daily_menu_id ? (mealTypeByMenu.get(menuItem.daily_menu_id) ?? null) : null
		for (const line of computeTheoreticalConsumption(menuItem.recipe ?? null, Number(menuItem.planned_portion_quantity ?? 0))) {
			const current = totals.get(line.ingredientId)
			if (!current) {
				totals.set(line.ingredientId, { quantity: line.quantity, mealTypeId })
				continue
			}
			// O arroz que vai no almoço E no jantar sai do estoque uma vez só, e
			// não é de nenhuma das duas refeições: rotulá-lo com a primeira que
			// apareceu manda o almoxarife separar metade da quantidade. Refeição
			// ambígua não tem rótulo.
			totals.set(line.ingredientId, {
				quantity: current.quantity + line.quantity,
				mealTypeId: current.mealTypeId === mealTypeId ? current.mealTypeId : null,
			})
		}
	}
	if (totals.size === 0) return { lines: [], taskIds: taskList.map((task) => task.id) }

	// fator de correção e embalagem de saída vêm do insumo
	const { data: ingredients } = await kit
		.from("ingredient")
		.select("id, description, measure_unit, correction_factor, issue_package_quantity")
		.in("id", [...totals.keys()])
	type IngredientMeta = { id: string; description: string; correction_factor: number | null; issue_package_quantity: number | null }
	const metaById = new Map(((ingredients ?? []) as IngredientMeta[]).map((row) => [row.id, row]))

	const lines = [...totals.entries()].map(([ingredientId, total]) => {
		const meta = metaById.get(ingredientId)
		const gross = total.quantity * Number(meta?.correction_factor ?? 1)
		return {
			ingredientId,
			mealTypeId: total.mealTypeId,
			suggestedQty: roundToIssuePackage(gross, meta?.issue_package_quantity),
		}
	})
	return { lines, taskIds: taskList.map((task) => task.id) }
}

/** Abre (ou recupera) a requisição do dia e recalcula a sugestão. */
export const openIssueRequestFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			issueDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			origin: z.enum(["production", "ad_hoc"]).default("production"),
			destination: z.string().max(200).optional(),
			purpose: z.string().max(300).optional(),
			authorizationReference: z.string().max(200).optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()
		const issueDate = data.issueDate ?? brasiliaToday()

		if (data.origin === "ad_hoc" && !data.purpose?.trim()) {
			// saída avulsa sem destino é saída sem dono: ela não tem cardápio para
			// explicá-la depois
			throw new Error("Saída avulsa exige destino e motivo")
		}

		// Abrir a requisição do dia é check-then-act sobre
		// `unique (kitchen_id, issue_date, origin)`: dois operadores entrando na
		// tela ao mesmo tempo — o normal, na troca de turno — não veem linha
		// nenhuma, os dois inserem, e o segundo toma 23505 com "Erro ao abrir a
		// requisição" na cara. Quem resolve a corrida é o índice, não o `select`:
		// o insert ignora o conflito e, quando ele acontece, a leitura seguinte
		// devolve a linha que o outro acabou de criar.
		const readRequest = async () =>
			(await inv
				.from("stock_issue_request")
				.select("id, status")
				.eq("kitchen_id", data.kitchenId)
				.eq("issue_date", issueDate)
				.eq("origin", data.origin)
				.maybeSingle()) as { data: { id: string; status: string } | null }

		let { data: existing } = await readRequest()
		if (!existing) {
			const { error } = await inv.from("stock_issue_request").upsert(
				{
					kitchen_id: data.kitchenId,
					issue_date: issueDate,
					origin: data.origin,
					destination: data.destination?.trim() || null,
					purpose: data.purpose?.trim() || null,
					authorization_reference: data.authorizationReference?.trim() || null,
					created_by: userId,
				},
				{ onConflict: "kitchen_id,issue_date,origin", ignoreDuplicates: true }
			)
			if (error) throw new Error(`Erro ao abrir a requisição: ${error.message}`)
			;({ data: existing } = await readRequest())
			if (!existing) throw new Error("Erro ao abrir a requisição do dia")
		}

		const requestId = existing.id
		if (existing.status !== "open") {
			return { requestId, reopened: false as const, suggested: 0 }
		}

		if (data.origin === "ad_hoc") return { requestId, reopened: false as const, suggested: 0 }

		// Enquanto aberta, a sugestão acompanha o planejamento: o efetivo muda.
		// O conflito é por (requisição, ingrediente) e NÃO inclui a refeição: em
		// índice único o NULL é distinto de NULL, então item sem refeição — o caso
		// comum — nunca conflitava, e cada carregamento da tela acrescentava uma
		// linha duplicada do mesmo insumo. A refeição segue como informação.
		const { lines } = await computeSuggestion(data.kitchenId, issueDate)
		if (lines.length > 0) {
			const { error: upsertError } = await inv.from("stock_issue_request_item").upsert(
				lines.map((line) => ({
					request_id: requestId,
					ingredient_id: line.ingredientId,
					meal_type_id: line.mealTypeId,
					suggested_qty: line.suggestedQty,
				})),
				{ onConflict: "request_id,ingredient_id" }
			)
			if (upsertError) throw new Error(`Erro ao gravar a sugestão do dia: ${upsertError.message}`)
		}
		return { requestId, reopened: false as const, suggested: lines.length }
	})

/**
 * Requisição do dia, SEM criar nada.
 *
 * O loader da tela precisa ser leitura pura: com `defaultPreload: "intent"`,
 * passar o mouse no link da barra lateral já criava o documento do dia — e a
 * cozinha acordava com requisições que ninguém abriu.
 */
export const fetchTodayIssueRequestFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			issueDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			origin: z.enum(["production", "ad_hoc"]).default("production"),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: row } = await inventory()
			.from("stock_issue_request")
			.select("id")
			.eq("kitchen_id", data.kitchenId)
			.eq("issue_date", data.issueDate ?? brasiliaToday())
			.eq("origin", data.origin)
			.maybeSingle()
		return { requestId: (row?.id as string | undefined) ?? null }
	})

/** Emite a saída de um ingrediente. */
export const issueStockFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			requestId: z.uuid(),
			ingredientId: z.uuid(),
			quantity: z.number().positive(),
			emissionId: z.string().min(8).max(64),
			overrideLotId: z.uuid().optional(),
			justification: z.string().max(300).optional(),
			productionTaskId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request } = await inv.from("stock_issue_request").select("kitchen_id, status").eq("id", data.requestId).maybeSingle()
		if (!request) throw new Error("Requisição não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(request.kitchen_id))
		if (request.status !== "open") throw new Error("Requisição já fechada — abra a do dia atual")

		// lote escolhido à mão: justificativa sempre; se vencido, nível 3
		if (data.overrideLotId) {
			if (!data.justification?.trim()) throw new Error("Escolher o lote fora da ordem exige justificativa")
			const { data: lot } = await inv.from("stock_lot").select("expiry_date, quarantined_at").eq("id", data.overrideLotId).maybeSingle()
			if (lot?.quarantined_at) throw new Error("Lote em quarentena não sai para produção")
			if (lot?.expiry_date && lot.expiry_date < brasiliaToday()) {
				await requireStorageForKitchen(3, Number(request.kitchen_id))
			}
		}

		const { data: result, error } = await inv.rpc("issue_stock", {
			p_request_id: data.requestId,
			p_ingredient_id: data.ingredientId,
			p_quantity: data.quantity,
			p_user: userId,
			p_emission_id: data.emissionId,
			p_override_lot_id: data.overrideLotId ?? null,
			p_justification: data.justification?.trim() || null,
			p_production_task_id: data.productionTaskId ?? null,
		})
		if (error) throw new Error(`Erro ao emitir a saída: ${error.message}`)
		const row = result?.[0]
		return { movements: Number(row?.movements ?? 0), withoutLot: Number(row?.without_lot ?? 0) }
	})

/** Devolve ao lote de origem o que saiu e não foi usado. */
export const returnIssueFn = createServerFn({ method: "POST" })
	.validator(z.object({ requestId: z.uuid(), lotId: z.uuid(), quantity: z.number().positive(), emissionId: z.string().min(8).max(64) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request } = await inv.from("stock_issue_request").select("kitchen_id").eq("id", data.requestId).maybeSingle()
		if (!request) throw new Error("Requisição não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(request.kitchen_id))

		const { data: result, error } = await inv.rpc("return_issue", {
			p_request_id: data.requestId,
			p_lot_id: data.lotId,
			p_quantity: data.quantity,
			p_user: userId,
			p_emission_id: data.emissionId,
		})
		if (error) throw new Error(`Erro ao devolver: ${error.message}`)
		return { unitCost: Number(result?.[0]?.return_unit_cost ?? 0) }
	})

/** Estado da requisição: sugerido, emitido líquido e o que pede motivo. */
export const fetchIssueRequestFn = createServerFn({ method: "GET" })
	.validator(z.object({ requestId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const kit = kitchen()
		const { data: request } = await inv
			.from("stock_issue_request")
			.select("id, kitchen_id, issue_date, origin, status, destination, purpose, closed_at")
			.eq("id", data.requestId)
			.maybeSingle()
		if (!request) throw new Error("Requisição não encontrada")
		await requireStorageForKitchen(1, Number(request.kitchen_id))

		const [{ data: items }, { data: movements }, settings] = await Promise.all([
			inv
				.from("stock_issue_request_item")
				.select("id, ingredient_id, meal_type_id, suggested_qty, variance_reason, variance_note")
				.eq("request_id", data.requestId),
			inv.from("stock_movement").select("ingredient_id, lot_id, type, quantity, unit_cost").eq("issue_request_id", data.requestId),
			toleranceFor(Number(request.kitchen_id)),
		])

		const issued = new Map<string, number>()
		const returned = new Map<string, number>()
		const costs = new Map<string, number>()
		for (const move of (movements ?? []) as Array<{ ingredient_id: string | null; type: string; quantity: number; unit_cost: number | null }>) {
			if (move.ingredient_id == null) continue
			const target = move.type === "issue_return" ? returned : issued
			target.set(move.ingredient_id, (target.get(move.ingredient_id) ?? 0) + Number(move.quantity))
			if (move.unit_cost != null) costs.set(move.ingredient_id, Number(move.unit_cost))
		}

		const rows = (items ?? []) as Array<{
			id: string
			ingredient_id: string
			meal_type_id: string | null
			suggested_qty: number | null
			variance_reason: string | null
		}>
		const ingredientIds = [...new Set([...rows.map((row) => row.ingredient_id), ...issued.keys()])]

		// Custo médio para o item que NÃO teve movimento nesta requisição. Sem
		// isso, o item planejado e nunca baixado ficava com custo nulo, o valor do
		// desvio dava zero, o piso nunca era ultrapassado — e o dia fechava com
		// falta de 100% sem uma linha de justificativa.
		if (ingredientIds.length > 0) {
			const { data: averages } = await inv
				.from("stock_cost")
				.select("ingredient_id, avg_unit_cost")
				.eq("kitchen_id", Number(request.kitchen_id))
				.in("ingredient_id", ingredientIds)
			for (const row of (averages ?? []) as Array<{ ingredient_id: string | null; avg_unit_cost: number | null }>) {
				if (row.ingredient_id == null) continue
				if (!costs.has(row.ingredient_id) && row.avg_unit_cost != null) costs.set(row.ingredient_id, Number(row.avg_unit_cost))
			}
		}

		const names = new Map<string, { description: string; measure_unit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ingredients } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			for (const ingredient of ingredients ?? []) names.set(ingredient.id, ingredient)
		}

		const lines: IssueLineForVariance[] = ingredientIds.map((ingredientId) => {
			const row = rows.find((item) => item.ingredient_id === ingredientId)
			return {
				ingredientId,
				suggestedQty: row?.suggested_qty != null ? Number(row.suggested_qty) : null,
				issuedNetQty: Number(((issued.get(ingredientId) ?? 0) - (returned.get(ingredientId) ?? 0)).toFixed(4)),
				unitCost: costs.get(ingredientId) ?? null,
				reason: row?.variance_reason ?? null,
			}
		})
		const closure = checkDayClosure(lines, settings)

		return {
			request,
			settings,
			canClose: closure.canClose,
			lines: closure.verdicts.map((verdict) => ({
				...verdict,
				itemId: rows.find((row) => row.ingredient_id === verdict.ingredientId)?.id ?? null,
				description: names.get(verdict.ingredientId)?.description ?? "—",
				measureUnit: names.get(verdict.ingredientId)?.measure_unit ?? null,
				reason: lines.find((line) => line.ingredientId === verdict.ingredientId)?.reason ?? null,
			})),
		}
	})

/** Registra o motivo do desvio de uma linha (pedido no fechamento). */
export const setVarianceReasonFn = createServerFn({ method: "POST" })
	.validator(z.object({ itemId: z.uuid(), reason: z.enum(ISSUE_VARIANCE_REASONS), note: z.string().max(300).optional() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: item } = await inv.from("stock_issue_request_item").select("request_id").eq("id", data.itemId).maybeSingle()
		if (!item) throw new Error("Linha não encontrada")
		const { data: request } = await inv.from("stock_issue_request").select("kitchen_id").eq("id", item.request_id).maybeSingle()
		await requireStorageForKitchen(2, Number(request?.kitchen_id))

		if (data.reason === "other" && !data.note?.trim()) throw new Error('Motivo "outro" exige a explicação')
		const { error } = await inv
			.from("stock_issue_request_item")
			.update({ variance_reason: data.reason, variance_note: data.note?.trim() || null })
			.eq("id", data.itemId)
		if (error) throw new Error(`Erro ao registrar o motivo: ${error.message}`)
		return { saved: true }
	})

/**
 * Fecha o dia: congela a sugestão e exige motivo onde o desvio passou das duas
 * tolerâncias. É o ÚNICO momento em que o motivo é pedido.
 */
export const closeIssueRequestFn = createServerFn({ method: "POST" })
	.validator(z.object({ requestId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request } = await inv.from("stock_issue_request").select("kitchen_id, status").eq("id", data.requestId).maybeSingle()
		if (!request) throw new Error("Requisição não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(request.kitchen_id))
		if (request.status !== "open") throw new Error("Requisição já fechada")

		const state = await fetchIssueRequestFn({ data: { requestId: data.requestId } })
		if (!state.canClose) {
			const pending = state.lines.filter((line) => line.requiresReason && !line.hasReason).map((line) => line.description)
			throw new Error(`Informe o motivo do desvio antes de fechar: ${pending.join(", ")}`)
		}

		const now = new Date().toISOString()
		// a sugestão vira o número contra o qual a variância do mês é medida
		await inv.from("stock_issue_request_item").update({ suggested_frozen_at: now }).eq("request_id", data.requestId).is("suggested_frozen_at", null)
		const { error } = await inv.from("stock_issue_request").update({ status: "closed", closed_by: userId, closed_at: now }).eq("id", data.requestId)
		if (error) throw new Error(`Erro ao fechar o dia: ${error.message}`)
		return { closed: true }
	})

/** Requisições da cozinha, com limite e total. */
export const listIssueRequestsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(30) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const {
			data: rows,
			count,
			error,
		} = await inventory()
			.from("stock_issue_request")
			.select("id, issue_date, origin, status, destination, purpose, closed_at", { count: "exact" })
			.eq("kitchen_id", data.kitchenId)
			.order("issue_date", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao listar requisições: ${error.message}`)
		return { requests: rows ?? [], total: count ?? (rows ?? []).length }
	})
