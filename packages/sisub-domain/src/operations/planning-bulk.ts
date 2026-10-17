/**
 * Edição em lote do Agendamento da Produção — o que a nutricionista faz em vários dias de uma vez:
 * apagar o planejado, levar a semana para a seguinte, repetir a semana passada, trocar uma
 * preparação em todos os dias, levar as fichas à versão vigente.
 *
 * As regras são as dos ajustes de um dia (`planning-adjustments.ts`), aplicadas ao conjunto numa
 * transação só: nada é apagado de verdade (vai para a lixeira), produção de pedido de lanche fica
 * de fora (segue o pedido), e o que já começou a ser produzido não se move, não sai e não muda.
 * Onde pular o que começou mantém o resto coerente (apagar, trocar, atualizar versão), pula e
 * conta; onde não (mover um dia pela metade), recusa tudo.
 */

import { dailyMenuInKitchen, menuItemsInKitchen, productionTaskInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireKitchen } from "../guards/require-permission.ts"
import type { ClearPlannedDays, RefreshRecipeVersionsInDays, ReplaceRecipeInDays, ShiftPlannedDays } from "../schemas/planning.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { addCivilDays, getBrasiliaToday } from "../utils/civil-date.ts"
import { runQuery, toWire } from "../utils/index.ts"
import { activeItemsOfDay, assertNoStartedProduction, notSystemMealTypeMenu, type PlanningDb, softDeleteItems } from "./planning-adjustments.ts"
import { loadLineageRows, loadRecipeLineageRoot, pickLiveLineageHead } from "./recipe-head.ts"

type ActiveItem = Awaited<ReturnType<typeof activeItemsOfDay>>[number]

function formatDates(dates: readonly string[]): string {
	return dates.map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(", ")
}

/** Itens ativos de vários dias, um dia por vez (dentro da transação, em ordem). */
async function activeItemsOfDays(db: PlanningDb, kitchenId: number, dates: readonly string[]): Promise<ActiveItem[]> {
	const out: ActiveItem[] = []
	for (const date of [...new Set(dates)]) out.push(...(await activeItemsOfDay(db, kitchenId, date)))
	return out
}

/**
 * Itens cuja produção já começou (ou terminou). Trava TODAS as tarefas dos itens, como
 * `assertNoStartedProduction`: o turno que clica "Iniciar" ao mesmo tempo espera esta transação.
 */
async function startedItemIds(db: PlanningDb, itemIds: readonly string[]): Promise<Set<string>> {
	if (itemIds.length === 0) return new Set()
	const tasks = await runQuery("FETCH_FAILED", () =>
		db
			.select({ menuItemId: productionTaskInKitchen.menuItemId, status: productionTaskInKitchen.status })
			.from(productionTaskInKitchen)
			.where(inArray(productionTaskInKitchen.menuItemId, [...itemIds]))
			.for("update")
	)
	return new Set(tasks.filter((t) => t.status !== "PENDING" && t.menuItemId != null).map((t) => t.menuItemId as string))
}

/**
 * Aposenta o cardápio do dia que ficou sem preparação nenhuma. Diferente do ajuste de um dia,
 * o efetivo informado NÃO segura o cardápio: quem apaga ou move o dia está dizendo que aquela
 * refeição não acontece ali. Restaurar um item da lixeira reativa o cardápio.
 */
async function retireMenusWithoutItems(db: PlanningDb, menuIds: readonly (string | null)[]): Promise<void> {
	const ids = [...new Set(menuIds.filter((id): id is string => id != null))]
	if (ids.length === 0) return
	await runQuery("DELETE_FAILED", () =>
		db
			.update(dailyMenuInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(
				and(
					inArray(dailyMenuInKitchen.id, ids),
					isNull(dailyMenuInKitchen.deletedAt),
					sql`not exists (select 1 from kitchen.menu_items mi where mi.daily_menu_id = ${dailyMenuInKitchen.id} and mi.deleted_at is null)`
				)
			)
			.then(() => undefined)
	)
}

/** Cardápios ativos (não de sistema) de um dia, por tipo de refeição. */
async function menusOfDay(db: PlanningDb, kitchenId: number, date: string) {
	return runQuery("FETCH_FAILED", () =>
		db
			.select({ id: dailyMenuInKitchen.id, mealTypeId: dailyMenuInKitchen.mealTypeId, forecastedHeadcount: dailyMenuInKitchen.forecastedHeadcount })
			.from(dailyMenuInKitchen)
			.where(
				and(eq(dailyMenuInKitchen.kitchenId, kitchenId), eq(dailyMenuInKitchen.serviceDate, date), isNull(dailyMenuInKitchen.deletedAt), notSystemMealTypeMenu)
			)
	)
}

function assertNotPast(dates: readonly string[], what: string): void {
	const today = getBrasiliaToday()
	const past = dates.filter((d) => d < today)
	if (past.length > 0) {
		throw new DomainError(
			"PAST_DATE",
			`${what} ${formatDates(past)} já ${past.length === 1 ? "passou" : "passaram"}. O que foi servido é registro: ajuste no próprio dia.`,
			{
				dates: past,
			}
		)
	}
}

// ─── Apagar dias ─────────────────────────────────────────────────────────────

/** Manda para a lixeira o planejado dos dias escolhidos. Item já em produção fica e é contado. */
export async function clearPlannedDays(db: SisubDb, ctx: UserContext, input: ClearPlannedDays): Promise<{ removed: number; keptStarted: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	assertNotPast(input.dates, "O dia")
	return db.transaction(async (tx) => {
		const items = await activeItemsOfDays(tx, input.kitchenId, input.dates)
		const started = await startedItemIds(
			tx,
			items.map((i) => i.id)
		)
		const removable = items.filter((i) => !started.has(i.id))
		await softDeleteItems(
			tx,
			removable.map((i) => i.id)
		)
		await retireMenusWithoutItems(
			tx,
			removable.map((i) => i.dailyMenuId)
		)
		return { removed: removable.length, keptStarted: started.size }
	})
}

// ─── Mover ou copiar dias ────────────────────────────────────────────────────

/**
 * Leva (move) ou repete (copy) os dias escolhidos `offsetDays` adiante (ou atrás), mantendo o
 * espaçamento. Mover leva os itens (mesmo id) com tudo o que o dia decidiu (porções, trocas,
 * substitutos) e as tarefas pendentes; copiar cria itens novos com a mesma ficha congelada,
 * porções, grupo e origem, sem os registros do dia (substituto, troca, execução), que eram de lá.
 * O efetivo de cada refeição vai junto.
 */
export async function shiftPlannedDays(
	db: SisubDb,
	ctx: UserContext,
	input: ShiftPlannedDays
): Promise<{ days: number; items: number; menusCreated: number; replaced: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	const sources = [...new Set(input.dates)].sort()
	const targetOf = (date: string) => addCivilDays(date, input.offsetDays)
	const targets = sources.map(targetOf)
	assertNotPast(targets, "O dia de destino")
	// Mover um dia passado tiraria do registro o que foi servido; copiar dele é o "repetir a semana".
	if (input.mode === "move") assertNotPast(sources, "O dia")
	const sourceSet = new Set(sources)
	if (input.mode === "copy" && targets.some((t) => sourceSet.has(t))) {
		throw new DomainError("OVERLAP", "Ao copiar, o destino não pode cair sobre um dos dias copiados. Escolha um destino depois (ou antes) de todos eles.")
	}

	return db.transaction(async (tx) => {
		// Destino ocupado: no mover, o dia que também sai do lugar não conta (a semana arrastada um
		// dia para frente libera o próprio caminho).
		const occupied: { date: string; items: ActiveItem[] }[] = []
		for (const target of targets) {
			if (input.mode === "move" && sourceSet.has(target)) continue
			const items = await activeItemsOfDay(tx, input.kitchenId, target)
			if (items.length > 0) occupied.push({ date: target, items })
		}
		let replaced = 0
		if (occupied.length > 0) {
			if (!input.replaceTarget) {
				throw new DomainError(
					"TARGET_NOT_EMPTY",
					`${occupied.length === 1 ? "O dia" : "Os dias"} ${formatDates(occupied.map((o) => o.date))} já ${occupied.length === 1 ? "tem" : "têm"} preparações. Marque "substituir o que já está no destino" ou escolha outro destino.`,
					{ dates: occupied.map((o) => o.date) }
				)
			}
			const ids = occupied.flatMap((o) => o.items.map((i) => i.id))
			await assertNoStartedProduction(tx, ids)
			await softDeleteItems(tx, ids)
			replaced = ids.length
		}

		// Movendo para frente, o último dia sai primeiro (e vice-versa): quem chega encontra o lugar livre.
		const order = input.mode === "move" && input.offsetDays > 0 ? [...sources].reverse() : sources
		let moved = 0
		let menusCreated = 0
		for (const source of order) {
			const target = targetOf(source)
			const items = await activeItemsOfDay(tx, input.kitchenId, source)
			if (items.length === 0) continue
			const ids = items.map((i) => i.id)
			// Dia pela metade não se move: o que começou fica, e o resto viraria outro dia sem ele.
			if (input.mode === "move") await assertNoStartedProduction(tx, ids)

			const sourceMenus = await menusOfDay(tx, input.kitchenId, source)
			const targetMenus = await menusOfDay(tx, input.kitchenId, target)
			const headcountOf = new Map(sourceMenus.map((m) => [m.mealTypeId, m.forecastedHeadcount]))

			const byMealType = new Map<string, ActiveItem[]>()
			for (const item of items) {
				if (!item.mealTypeId) continue
				byMealType.set(item.mealTypeId, [...(byMealType.get(item.mealTypeId) ?? []), item])
			}

			for (const [mealTypeId, mealItems] of byMealType) {
				const headcount = headcountOf.get(mealTypeId) ?? null
				let targetMenu = targetMenus.find((m) => m.mealTypeId === mealTypeId)
				if (!targetMenu) {
					const [created] = await runQuery("INSERT_FAILED", () =>
						tx
							.insert(dailyMenuInKitchen)
							.values({ kitchenId: input.kitchenId, serviceDate: target, mealTypeId, status: "PLANNED", forecastedHeadcount: headcount })
							.returning({ id: dailyMenuInKitchen.id, mealTypeId: dailyMenuInKitchen.mealTypeId, forecastedHeadcount: dailyMenuInKitchen.forecastedHeadcount })
					)
					if (!created) throw new DomainError("INSERT_FAILED", "no row returned")
					targetMenu = created
					menusCreated++
				} else if (targetMenu.forecastedHeadcount == null && headcount != null) {
					const menuId = targetMenu.id
					await runQuery("UPDATE_FAILED", () =>
						tx
							.update(dailyMenuInKitchen)
							.set({ forecastedHeadcount: headcount })
							.where(eq(dailyMenuInKitchen.id, menuId))
							.then(() => undefined)
					)
				}
				const menuId = targetMenu.id

				if (input.mode === "move") {
					await runQuery("UPDATE_FAILED", () =>
						tx
							.update(menuItemsInKitchen)
							.set({ dailyMenuId: menuId })
							.where(
								inArray(
									menuItemsInKitchen.id,
									mealItems.map((i) => i.id)
								)
							)
							.then(() => undefined)
					)
					continue
				}

				const originals = await runQuery("FETCH_FAILED", () =>
					tx
						.select()
						.from(menuItemsInKitchen)
						.where(
							inArray(
								menuItemsInKitchen.id,
								mealItems.map((i) => i.id)
							)
						)
				)
				await runQuery("INSERT_FAILED", () =>
					tx
						.insert(menuItemsInKitchen)
						.values(
							originals.map((o) => ({
								dailyMenuId: menuId,
								recipeOriginId: o.recipeOriginId,
								recipe: o.recipe,
								plannedPortionQuantity: o.plannedPortionQuantity,
								recommendedProportion: o.recommendedProportion,
								excludedFromProcurement: o.excludedFromProcurement,
								itemGroup: o.itemGroup,
								sortOrder: o.sortOrder,
								originTemplateId: o.originTemplateId,
								originTemplateType: o.originTemplateType,
							}))
						)
						.then(() => undefined)
				)
			}

			if (input.mode === "move") {
				// Tarefa ainda pendente acompanha o item (a iniciada foi recusada acima).
				await runQuery("UPDATE_FAILED", () =>
					tx
						.update(productionTaskInKitchen)
						.set({ productionDate: target, updatedAt: new Date().toISOString() })
						.where(inArray(productionTaskInKitchen.menuItemId, ids))
						.then(() => undefined)
				)
				await retireMenusWithoutItems(
					tx,
					sourceMenus.map((m) => m.id)
				)
			}
			moved += ids.length
		}

		// Cardápio do destino que só tinha o que foi substituído (e não recebeu nada) sai também.
		if (occupied.length > 0) {
			await retireMenusWithoutItems(
				tx,
				occupied.flatMap((o) => o.items.map((i) => i.dailyMenuId))
			)
		}
		return { days: sources.length, items: moved, menusCreated, replaced }
	})
}

// ─── Trocar uma preparação em vários dias ────────────────────────────────────

/** Snapshot da ficha no contrato snake_case — o mesmo de incluir ou trocar um item do dia. */
async function loadRecipeSnapshot(db: PlanningDb, recipeId: string, kitchenId: number) {
	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({
			where: and(eq(recipesInKitchen.id, recipeId), isNull(recipesInKitchen.deletedAt)),
			with: { recipeIngredientsInKitchens: { with: { ingredientInKitchen: true } } },
		})
	)
	if (!recipe) throw new DomainError("RECIPE_NOT_FOUND", `Recipe ${recipeId} not found`)
	if (recipe.kitchenId !== null && recipe.kitchenId !== kitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${recipeId} does not belong to kitchen ${kitchenId}`)
	}
	return {
		name: recipe.name,
		snapshot: toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }),
	}
}

/**
 * Troca `fromRecipeId` por `toRecipeId` em todos os itens dela nos dias escolhidos — o
 * fornecedor parou de entregar, a preparação saiu do cardápio. Cada item guarda o motivo
 * (`substitutions.recipe_swap`), como a troca de um item só. Item cuja refeição já tem a nova
 * preparação fica como está (seriam duas iguais), e o que já está em produção também; os dois
 * são contados.
 */
export async function replaceRecipeInDays(
	db: SisubDb,
	ctx: UserContext,
	input: ReplaceRecipeInDays
): Promise<{ replaced: number; skippedDuplicate: number; skippedStarted: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	if (input.fromRecipeId === input.toRecipeId) throw new DomainError("SAME_RECIPE", "Escolha uma preparação diferente da atual.")
	assertNotPast(input.dates, "O dia")
	const { snapshot } = await loadRecipeSnapshot(db, input.toRecipeId, input.kitchenId)

	return db.transaction(async (tx) => {
		const items = await activeItemsOfDays(tx, input.kitchenId, input.dates)
		const targets = items.filter((i) => i.recipeOriginId === input.fromRecipeId)
		const menusWithNew = new Set(items.filter((i) => i.recipeOriginId === input.toRecipeId).map((i) => i.dailyMenuId))
		const started = await startedItemIds(
			tx,
			targets.map((i) => i.id)
		)
		const duplicates = targets.filter((i) => menusWithNew.has(i.dailyMenuId))
		const replaceable = targets.filter((i) => !started.has(i.id) && !menusWithNew.has(i.dailyMenuId))
		if (replaceable.length === 0) return { replaced: 0, skippedDuplicate: duplicates.length, skippedStarted: started.size }

		const [previous] = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ recipe: menuItemsInKitchen.recipe })
				.from(menuItemsInKitchen)
				.where(eq(menuItemsInKitchen.id, replaceable[0]?.id as string))
				.limit(1)
		)
		const previousName = (previous?.recipe as { name?: string } | null)?.name ?? null
		await runQuery("UPDATE_FAILED", () =>
			tx
				.update(menuItemsInKitchen)
				.set({
					recipeOriginId: input.toRecipeId,
					recipe: snapshot,
					// Os substitutos de insumo se referiam à preparação que saiu (mesma regra da troca de um item).
					substitutions: {
						recipe_swap: {
							type: "recipe_swap",
							rationale: input.rationale,
							updated_at: new Date().toISOString(),
							from_recipe_id: input.fromRecipeId,
							from_recipe_name: previousName,
						},
					},
				})
				.where(
					and(
						inArray(
							menuItemsInKitchen.id,
							replaceable.map((i) => i.id)
						),
						isNull(menuItemsInKitchen.deletedAt)
					)
				)
				.then(() => undefined)
		)
		return { replaced: replaceable.length, skippedDuplicate: duplicates.length, skippedStarted: started.size }
	})
}

// ─── Atualizar versões ───────────────────────────────────────────────────────

/**
 * Leva à versão vigente (na cozinha) os itens dos dias escolhidos cuja ficha ficou numa versão
 * superada. Não é troca de preparação: não pede motivo nem marca `recipe_swap`, e mantém os
 * substitutos de insumo (os insumos da linhagem são os mesmos). Se a refeição já tem a versão
 * vigente, o item antigo sai (seriam duas). Item em produção fica, e é contado.
 */
export async function refreshRecipeVersionsInDays(
	db: SisubDb,
	ctx: UserContext,
	input: RefreshRecipeVersionsInDays
): Promise<{ updated: number; merged: number; skippedStarted: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	assertNotPast(input.dates, "O dia")

	return db.transaction(async (tx) => {
		const items = await activeItemsOfDays(tx, input.kitchenId, input.dates)
		const headOf = new Map<string, string | null>()
		for (const recipeId of new Set(items.map((i) => i.recipeOriginId).filter((id): id is string => id != null))) {
			const { rootId } = await loadRecipeLineageRoot(tx, recipeId)
			headOf.set(recipeId, pickLiveLineageHead(await loadLineageRows(tx, rootId), input.kitchenId)?.id ?? null)
		}
		const outdated = items.filter((i) => {
			const head = i.recipeOriginId ? headOf.get(i.recipeOriginId) : null
			return head != null && head !== i.recipeOriginId
		})
		const started = await startedItemIds(
			tx,
			outdated.map((i) => i.id)
		)
		const pending = outdated.filter((i) => !started.has(i.id))

		let updated = 0
		const merged: string[] = []
		const snapshotOf = new Map<string, Record<string, unknown>>()
		for (const item of pending) {
			const head = headOf.get(item.recipeOriginId as string) as string
			const alreadyThere = items.some((other) => other.dailyMenuId === item.dailyMenuId && other.recipeOriginId === head)
			if (alreadyThere) {
				merged.push(item.id)
				continue
			}
			if (!snapshotOf.has(head)) snapshotOf.set(head, (await loadRecipeSnapshot(tx, head, input.kitchenId)).snapshot)
			await runQuery("UPDATE_FAILED", () =>
				tx
					.update(menuItemsInKitchen)
					.set({ recipeOriginId: head, recipe: snapshotOf.get(head) })
					.where(and(eq(menuItemsInKitchen.id, item.id), isNull(menuItemsInKitchen.deletedAt)))
					.then(() => undefined)
			)
			updated++
		}
		await softDeleteItems(tx, merged)
		return { updated, merged: merged.length, skippedStarted: started.size }
	})
}
