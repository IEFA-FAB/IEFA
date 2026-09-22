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
	issueSuggestionFingerprint,
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
	const { data: row, error } = await inventory()
		.from("kitchen_stock_settings")
		.select("issue_tolerance_pct, issue_tolerance_floor_value")
		.eq("kitchen_id", kitchenId)
		.maybeSingle()
	// Sem linha valem os defaults — mas leitura que FALHA não é "sem linha": cair
	// no default aqui trocaria a tolerância da cozinha pela de fábrica em silêncio.
	if (error) throw new Error(`Erro ao carregar a tolerância da cozinha: ${error.message}`)
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
	const allTasks = (tasks ?? []) as Array<{ id: string; menu_item_id: string }>
	if (allTasks.length === 0) return { lines: [], taskIds: [] as string[] }

	// Tarefa que já saiu pela "Baixa por Produção" não entra na sugestão do dia. São dois
	// canais de saída sobre a mesma tarefa: sem isto o café baixado de manhã voltava na
	// requisição como "sugerido 220 · saiu 0 · desvio 100%", pedindo motivo — e convidando
	// a baixar de novo.
	const { data: issuedMoves, error: issuedError } = await inventory()
		.from("stock_movement")
		.select("production_task_id")
		.in(
			"production_task_id",
			allTasks.map((task) => task.id)
		)
		.eq("type", "production_issue")
		.is("issue_request_id", null)
	if (issuedError) throw new Error(`Erro ao conferir as baixas por produção do dia: ${issuedError.message}`)
	const issuedByProduction = new Set((issuedMoves ?? []).map((move: { production_task_id: string | null }) => move.production_task_id))
	const taskList = allTasks.filter((task) => !issuedByProduction.has(task.id))
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
		// Prato e refeição REMOVIDOS do cardápio (soft-delete) não geram sugestão:
		// o quadro de produção já os esconde, e contá-los aqui fazia o dia pedir
		// motivo para a "falta" de algo que ninguém vai cozinhar.
		.is("deleted_at", null)
	if (menuError) throw new Error(`Erro ao carregar o cardápio do dia: ${menuError.message}`)

	const dailyMenuIds = [...new Set((menuItems ?? []).map((item: { daily_menu_id: string | null }) => item.daily_menu_id).filter(Boolean))] as string[]
	const mealTypeByMenu = new Map<string, string | null>()
	if (dailyMenuIds.length > 0) {
		const { data: dailyMenus, error: menuTypeError } = await kit.from("daily_menu").select("id, meal_type_id").in("id", dailyMenuIds).is("deleted_at", null)
		if (menuTypeError) throw new Error(`Erro ao carregar as refeições do dia: ${menuTypeError.message}`)
		for (const menu of dailyMenus ?? []) mealTypeByMenu.set(menu.id, menu.meal_type_id ?? null)
	}

	// prato de uma refeição removida sai junto com ela
	const menuById = new Map(
		((menuItems ?? []) as Array<{ id: string; daily_menu_id: string | null }>)
			.filter((item) => item.daily_menu_id == null || mealTypeByMenu.has(item.daily_menu_id))
			.map((item) => [item.id, item])
	)

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
	// Erro aqui NÃO pode passar calado: sem os dados do insumo a sugestão era
	// gravada sem fator de correção e sem arredondar na embalagem, e a tela não
	// dizia nada.
	const { data: ingredients, error: ingredientError } = await kit
		.from("ingredient")
		.select("id, description, measure_unit, correction_factor, issue_package_quantity")
		.in("id", [...totals.keys()])
	if (ingredientError) throw new Error(`Erro ao carregar os dados dos insumos: ${ingredientError.message}`)
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

		if (data.origin === "ad_hoc" && (!data.purpose?.trim() || !data.destination?.trim())) {
			// Saída avulsa sem destino é saída sem dono: não há cardápio para
			// explicá-la depois. A guarda conferia só o motivo enquanto a mensagem
			// cobrava os dois, e o destino vazio ia para o banco como `null` —
			// calado, e justamente no documento que existe para responder "para
			// onde foi".
			throw new Error("Saída avulsa exige destino e motivo")
		}

		const values = {
			kitchen_id: data.kitchenId,
			issue_date: issueDate,
			origin: data.origin,
			destination: data.destination?.trim() || null,
			purpose: data.purpose?.trim() || null,
			authorization_reference: data.authorizationReference?.trim() || null,
			created_by: userId,
		}

		// Saída AVULSA: cada abertura é um documento novo. Pode haver várias no dia
		// (o apoio da manhã e o evento da noite), cada uma com o seu motivo e o seu
		// destino — reusar a primeira calada perdia os dois.
		if (data.origin === "ad_hoc") {
			const { data: created, error } = await inv.from("stock_issue_request").insert(values).select("id").single()
			if (error || !created) throw new Error(`Erro ao abrir a saída avulsa: ${error?.message}`)
			return { requestId: created.id as string, reopened: false as const, suggested: 0 }
		}

		// A da PRODUÇÃO é uma por dia, e abri-la é check-then-act sobre o índice
		// único parcial `(kitchen_id, issue_date) where origin = 'production'`: dois
		// operadores entrando na tela ao mesmo tempo — o normal, na troca de turno —
		// não veem linha nenhuma, os dois inserem, e o segundo toma 23505. Quem
		// resolve a corrida é o índice: o 23505 vira a leitura da linha que o outro
		// acabou de criar. (Não é `upsert(onConflict)`: o índice é PARCIAL, e o
		// Postgres não o infere de uma lista de colunas — daria 42P10.)
		const readRequest = async () => {
			const { data: row, error } = await inv
				.from("stock_issue_request")
				.select("id, status")
				.eq("kitchen_id", data.kitchenId)
				.eq("issue_date", issueDate)
				.eq("origin", "production")
				.maybeSingle()
			if (error) throw new Error(`Erro ao carregar a requisição do dia: ${error.message}`)
			return row as { id: string; status: string } | null
		}

		let existing = await readRequest()
		if (!existing) {
			const { error } = await inv.from("stock_issue_request").insert(values)
			if (error && error.code !== "23505") throw new Error(`Erro ao abrir a requisição: ${error.message}`)
			existing = await readRequest()
			if (!existing) throw new Error("Erro ao abrir a requisição do dia")
		}

		const requestId = existing.id
		if (existing.status !== "open") {
			return { requestId, reopened: false as const, suggested: 0 }
		}

		// Enquanto aberta, a sugestão acompanha o planejamento: o efetivo muda.
		// O conflito é por (requisição, ingrediente) e NÃO inclui a refeição: em
		// índice único o NULL é distinto de NULL, então item sem refeição — o caso
		// comum — nunca conflitava, e cada carregamento da tela acrescentava uma
		// linha duplicada do mesmo insumo. A refeição segue como informação.
		const { lines } = await computeSuggestion(data.kitchenId, issueDate)
		// Gravar e zerar os que saíram do plano numa função só, que trava as linhas
		// ANTES da requisição — a ordem do fechamento. O upsert de várias linhas
		// travava na ordem inversa (pelo gatilho de cada linha) e dava deadlock
		// com o fechamento. Zerar, e não apagar: o motivo já registrado segue
		// sendo o registro do que aconteceu, e o item que saiu do plano depois de
		// sair do estoque ainda deve justificativa (`evaluateVariance`).
		const { error: refreshError } = await inv.rpc("refresh_issue_suggestion", {
			p_request_id: requestId,
			p_lines: lines.map((line) => ({ ingredient_id: line.ingredientId, meal_type_id: line.mealTypeId, suggested_qty: line.suggestedQty })),
		})
		if (refreshError) throw new Error(`Erro ao gravar a sugestão do dia: ${refreshError.message}`)

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
			/** Avulsa escolhida na tela; sem ela, a avulsa ABERTA mais recente do dia. */
			requestId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const issueDate = data.issueDate ?? brasiliaToday()
		if (data.origin === "production") {
			const { data: row, error } = await inventory()
				.from("stock_issue_request")
				.select("id")
				.eq("kitchen_id", data.kitchenId)
				.eq("issue_date", issueDate)
				.eq("origin", "production")
				.maybeSingle()
			if (error) throw new Error(`Erro ao carregar a requisição do dia: ${error.message}`)
			return { requestId: (row?.id as string | undefined) ?? null, adHocToday: [] as AdHocSummary[] }
		}

		// Avulsas do dia: podem ser várias. A tela mostra a escolhida, ou a aberta
		// mais recente, e lista as outras para trocar.
		const { data: rows, error } = await inventory()
			.from("stock_issue_request")
			.select("id, status, purpose, destination, created_at")
			.eq("kitchen_id", data.kitchenId)
			.eq("issue_date", issueDate)
			.eq("origin", "ad_hoc")
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao carregar as saídas avulsas do dia: ${error.message}`)
		const adHocToday = ((rows ?? []) as Array<{ id: string; status: string; purpose: string | null; destination: string | null }>).map((row) => ({
			id: row.id,
			status: row.status,
			purpose: row.purpose,
			destination: row.destination,
		}))
		const chosen = data.requestId ? adHocToday.find((row) => row.id === data.requestId) : adHocToday.find((row) => row.status === "open")
		return { requestId: chosen?.id ?? null, adHocToday }
	})

interface AdHocSummary {
	id: string
	status: string
	purpose: string | null
	destination: string | null
}

/**
 * Quantidade de saída e devolução: no máximo 4 casas, que é o que
 * `stock_movement.quantity` (numeric(14,4)) guarda. Com mais casas, o reenvio
 * depois de um 502 comparava o número digitado com o gravado arredondado e era
 * recusado como "outra saída" — e o operador lançava de novo.
 */
const ISSUE_QUANTITY = z
	.number()
	.positive()
	// Com tolerância, e não `Number(value.toFixed(4)) === value`: o `toFixed`
	// herda o arredondamento binário (a família do `(1.005).toFixed(2)`), e um
	// valor legítimo de 4 casas podia ser recusado como se tivesse mais.
	.refine((value) => Math.abs(Math.round(value * 1e4) / 1e4 - value) < 1e-9, "Quantidade com no máximo 4 casas decimais")

/** Emite a saída de um ingrediente. */
export const issueStockFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			requestId: z.uuid(),
			ingredientId: z.uuid(),
			quantity: ISSUE_QUANTITY,
			emissionId: z.string().min(8).max(64),
			overrideLotId: z.uuid().optional(),
			justification: z.string().max(300).optional(),
			productionTaskId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request, error: requestError } = await inv.from("stock_issue_request").select("kitchen_id").eq("id", data.requestId).maybeSingle()
		if (requestError) throw new Error(`Erro ao carregar a requisição: ${requestError.message}`)
		if (!request) throw new Error("Requisição não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(request.kitchen_id))
		// A recusa de dia fechado é do `issue_stock`, DEPOIS de reconhecer o retry.
		// Recusar aqui antes cortava o retry de uma saída que passou pouco antes do
		// fechamento: a tela mandava abrir a requisição do dia seguinte, o operador
		// lançava de novo lá, e o estoque saía duas vezes.

		// lote escolhido à mão: justificativa sempre; se vencido, nível 3
		if (data.overrideLotId) {
			if (!data.justification?.trim()) throw new Error("Escolher o lote fora da ordem exige justificativa")
			const { data: lot, error: lotError } = await inv.from("stock_lot").select("expiry_date, quarantined_at").eq("id", data.overrideLotId).maybeSingle()
			if (lotError) throw new Error(`Erro ao conferir o lote: ${lotError.message}`)
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
	.validator(z.object({ requestId: z.uuid(), lotId: z.uuid(), quantity: ISSUE_QUANTITY, emissionId: z.string().min(8).max(64) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request, error: requestError } = await inv.from("stock_issue_request").select("kitchen_id").eq("id", data.requestId).maybeSingle()
		if (requestError) throw new Error(`Erro ao carregar a requisição: ${requestError.message}`)
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
		const { data: request, error: requestError } = await inv
			.from("stock_issue_request")
			.select("id, kitchen_id, issue_date, origin, status, destination, purpose, closed_at")
			.eq("id", data.requestId)
			.maybeSingle()
		if (requestError) throw new Error(`Erro ao carregar a requisição: ${requestError.message}`)
		if (!request) throw new Error("Requisição não encontrada")
		await requireStorageForKitchen(1, Number(request.kitchen_id))

		// Este retrato decide se o dia FECHA. Leitura que falha e vira lista vazia
		// faz toda linha parecer não planejada, nenhum motivo é exigido — e
		// `closeIssueRequestFn`, que monta o retrato por aqui, fecha o dia.
		const [{ data: items, error: itemsError }, { data: movements, error: movementsError }, settings] = await Promise.all([
			inv
				.from("stock_issue_request_item")
				.select("id, ingredient_id, meal_type_id, suggested_qty, variance_reason, variance_note")
				.eq("request_id", data.requestId),
			inv.from("stock_movement").select("ingredient_id, lot_id, type, quantity, unit_cost").eq("issue_request_id", data.requestId),
			toleranceFor(Number(request.kitchen_id)),
		])
		if (itemsError) throw new Error(`Erro ao carregar os itens do dia: ${itemsError.message}`)
		if (movementsError) throw new Error(`Erro ao carregar as saídas do dia: ${movementsError.message}`)

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
			const { data: averages, error: averagesError } = await inv
				.from("stock_cost")
				.select("ingredient_id, avg_unit_cost")
				.eq("kitchen_id", Number(request.kitchen_id))
				.in("ingredient_id", ingredientIds)
			// sem custo, o valor do desvio dá zero e o piso nunca é passado
			if (averagesError) throw new Error(`Erro ao carregar os custos: ${averagesError.message}`)
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
		const { data: item, error: itemError } = await inv.from("stock_issue_request_item").select("request_id").eq("id", data.itemId).maybeSingle()
		if (itemError) throw new Error(`Erro ao carregar a linha: ${itemError.message}`)
		if (!item) throw new Error("Linha não encontrada")
		const { data: request, error: requestError } = await inv.from("stock_issue_request").select("kitchen_id, status").eq("id", item.request_id).maybeSingle()
		if (requestError) throw new Error(`Erro ao carregar a requisição: ${requestError.message}`)
		if (!request) throw new Error("Requisição não encontrada")
		await requireStorageForKitchen(2, Number(request.kitchen_id))
		// Dia fechado é dia fechado: a variância foi julgada no fechamento contra
		// estes motivos, e trocá-los depois reescreveria o que foi aceito.
		if (request.status !== "open") throw new Error("A requisição já foi fechada — o motivo registrado no fechamento é o que vale")

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
		const { data: request, error: requestError } = await inv.from("stock_issue_request").select("kitchen_id, status").eq("id", data.requestId).maybeSingle()
		if (requestError) throw new Error(`Erro ao carregar a requisição: ${requestError.message}`)
		if (!request) throw new Error("Requisição não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(request.kitchen_id))
		if (request.status !== "open") throw new Error("Requisição já fechada")

		// Contagem ANTES do retrato: é ela que o banco vai reconferir sob trava.
		// Entre montar o retrato e gravar `closed` cabe uma emissão inteira — o
		// almoxarife retira mais 30 KG enquanto o gestor confirma o fechamento, a
		// linha passa da tolerância e o dia fecharia sem a justificativa que
		// aquela emissão exigiria.
		const { count: seenMovements, error: countError } = await inv
			.from("stock_movement")
			.select("id", { count: "exact", head: true })
			.eq("issue_request_id", data.requestId)
		if (countError) throw new Error(`Erro ao conferir os movimentos do dia: ${countError.message}`)
		// E a SUGESTÃO, também antes do retrato: "recalcular" no meio do fechamento
		// não muda a contagem, mas muda o número contra o qual a tolerância é medida.
		const { data: seenItems, error: seenItemsError } = await inv
			.from("stock_issue_request_item")
			.select("ingredient_id, suggested_qty")
			.eq("request_id", data.requestId)
		if (seenItemsError) throw new Error(`Erro ao conferir a sugestão do dia: ${seenItemsError.message}`)
		const seenSuggestions = issueSuggestionFingerprint(
			((seenItems ?? []) as Array<{ ingredient_id: string; suggested_qty: number | string | null }>).map((row) => ({
				ingredientId: row.ingredient_id,
				suggestedQty: row.suggested_qty,
			}))
		)

		const state = await fetchIssueRequestFn({ data: { requestId: data.requestId } })
		if (!state.canClose) {
			const pending = state.lines.filter((line) => line.requiresReason && !line.hasReason).map((line) => line.description)
			throw new Error(`Informe o motivo do desvio antes de fechar: ${pending.join(", ")}`)
		}

		// A matemática da tolerância fica no domínio, onde é testada; o banco
		// confere o que só ele pode: que nada entrou no meio.
		const { error } = await inv.rpc("close_issue_request", {
			p_request_id: data.requestId,
			p_user: userId,
			p_seen_movements: seenMovements ?? 0,
			p_seen_suggestions: seenSuggestions,
		})
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

/**
 * Lotes que ESTA requisição emitiu deste insumo, com o que ainda cabe devolver.
 *
 * A tela pedia o id do lote digitado à mão, e nunca mostrou um: o operador
 * colava um UUID de outro lugar e a devolução caía em OUTRO insumo enquanto o
 * aviso na tela nomeava a linha atual. O banco impede devolver mais do que
 * saiu — mas não impede devolver no insumo errado, e o erro só apareceria na
 * contagem, semanas depois.
 */
export const fetchReturnableLotsFn = createServerFn({ method: "GET" })
	.validator(z.object({ requestId: z.uuid(), ingredientId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: request } = await inv.from("stock_issue_request").select("kitchen_id").eq("id", data.requestId).maybeSingle()
		if (!request) throw new Error("Requisição não encontrada")
		await requireStorageForKitchen(1, Number(request.kitchen_id))

		const { data: moves, error } = await inv
			.from("stock_movement")
			.select("lot_id, type, quantity")
			.eq("issue_request_id", data.requestId)
			.eq("ingredient_id", data.ingredientId)
			.in("type", ["production_issue", "issue_return"])
		if (error) throw new Error(`Erro ao carregar os lotes emitidos: ${error.message}`)

		const net = new Map<string, number>()
		for (const move of (moves ?? []) as Array<{ lot_id: string | null; type: string; quantity: number }>) {
			// o movimento SEM lote é o saldo que faltou na emissão; não há lote
			// para devolver, e oferecê-lo criaria estoque do nada
			if (!move.lot_id) continue
			const signed = move.type === "production_issue" ? Number(move.quantity) : -Number(move.quantity)
			net.set(move.lot_id, (net.get(move.lot_id) ?? 0) + signed)
		}

		const lotIds = [...net.entries()].filter(([, quantity]) => quantity > 0).map(([lotId]) => lotId)
		if (lotIds.length === 0) return { lots: [] }
		const { data: lots } = await inv.from("stock_lot").select("id, short_code, lot_code, expiry_date").in("id", lotIds)
		return {
			lots: ((lots ?? []) as Array<{ id: string; short_code: string | null; lot_code: string | null; expiry_date: string | null }>)
				.map((lot) => ({
					lotId: lot.id,
					label: lot.short_code ?? lot.lot_code ?? lot.id.slice(0, 8),
					expiryDate: lot.expiry_date,
					returnable: net.get(lot.id) ?? 0,
				}))
				.sort((a, b) => b.returnable - a.returnable),
		}
	})
