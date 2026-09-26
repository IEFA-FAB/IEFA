/**
 * Ajustes do Agendamento da Produção — o que a realidade faz com o que foi planejado.
 *
 * O calendário só continua sendo a fonte da cozinha se absorver o imprevisto sem obrigar o
 * usuário a refazer tudo à mão (ou, pior, a anotar num caderno e deixar o sistema para trás):
 *
 *   - a viagem foi cancelada → tira do dia tudo o que aquele apoio/evento pôs ali;
 *   - a viagem foi adiada → leva tudo para a nova data, com os ajustes feitos no dia;
 *   - faltou luz ou água → troca o cardápio INTEIRO do dia por um de contingência;
 *   - faltou um alimento → troca a preparação mantendo porções, grupo e origem;
 *   - faltou um insumo → registra o substituto dentro da preparação (ver `planning.ts`).
 *
 * "O que um cardápio pôs no dia" é identificado pela origem gravada em cada item
 * (`menu_items.origin_template_id`). Produção de pedido de lanche (origem
 * `origin_snack_request_id`) fica de fora de propósito: ela segue o pedido, que tem fluxo e
 * cancelamento próprios.
 *
 * Nada é apagado de verdade: o que sai vai para a lixeira do agendamento (soft-delete) e
 * pode ser restaurado. O que já começou a ser produzido não se move nem sai.
 */

import {
	dailyMenuInKitchen,
	frozenPreparationInKitchen,
	ingredientInKitchen,
	menuItemsInKitchen,
	productionTaskInKitchen,
	recipeIngredientAlternativesInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { MenuItem } from "@iefa/database/sisub"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireKitchen } from "../guards/require-permission.ts"
import { resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import type {
	MenuItemSubstituteOptions,
	MoveOriginToDate,
	RecordMenuSubstitution,
	RemoveOriginFromDay,
	ReplaceDayWithTemplate,
	ReplaceMenuItemRecipe,
	SubstitutionEntry,
} from "../schemas/planning.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { brasiliaCivilDate, runQuery, toWire } from "../utils/index.ts"
import { applyEventTemplate } from "./templates.ts"

type PlanningTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]
type PlanningDb = SisubDb | PlanningTx

/** Cardápio de tipo de refeição de SISTEMA (produção dos pedidos de lanche): fora dos ajustes do rancho. */
const notSystemMealTypeMenu = sql`not exists (select 1 from kitchen.meal_type mt where mt.id = ${dailyMenuInKitchen.mealTypeId} and mt.system_key is not null)`

/** Itens ativos de um dia (todas as refeições), opcionalmente só de uma origem. */
async function activeItemsOfDay(db: PlanningDb, kitchenId: number, date: string, originTemplateId?: string) {
	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: menuItemsInKitchen.id,
				dailyMenuId: menuItemsInKitchen.dailyMenuId,
				mealTypeId: dailyMenuInKitchen.mealTypeId,
				sortOrder: menuItemsInKitchen.sortOrder,
				recipeOriginId: menuItemsInKitchen.recipeOriginId,
			})
			.from(menuItemsInKitchen)
			.innerJoin(dailyMenuInKitchen, eq(menuItemsInKitchen.dailyMenuId, dailyMenuInKitchen.id))
			.where(
				and(
					eq(dailyMenuInKitchen.kitchenId, kitchenId),
					eq(dailyMenuInKitchen.serviceDate, date),
					isNull(dailyMenuInKitchen.deletedAt),
					isNull(menuItemsInKitchen.deletedAt),
					isNull(menuItemsInKitchen.originSnackRequestId),
					notSystemMealTypeMenu,
					originTemplateId != null ? eq(menuItemsInKitchen.originTemplateId, originTemplateId) : undefined
				)
			)
	)
}

/**
 * Recusa mexer em item cuja produção já começou (ou terminou). Tirar ou mover o item nesse
 * ponto apagaria do agendamento uma produção que aconteceu — o turno precisa registrar sobra,
 * não o planejamento fingir que ela não existiu.
 */
async function assertNoStartedProduction(db: PlanningDb, itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) return
	// `for update` em TODAS as tarefas dos itens, não só nas já iniciadas: o turno que clica
	// "Iniciar" ao mesmo tempo espera esta transação terminar, em vez de começar uma produção
	// que o ajuste já tirou (ou mudou de dia) entre a checagem e a escrita.
	const tasks = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: productionTaskInKitchen.id, status: productionTaskInKitchen.status })
			.from(productionTaskInKitchen)
			.where(inArray(productionTaskInKitchen.menuItemId, itemIds))
			.for("update")
	)
	const started = tasks.filter((t) => t.status !== "PENDING")
	if (started.length > 0) {
		throw new DomainError(
			"PRODUCTION_ALREADY_STARTED",
			"Parte destas preparações já está em produção (ou foi concluída) na Produção Cozinha. Ajuste o que ainda não começou item a item, e registre a sobra do que já foi produzido."
		)
	}
}

async function softDeleteItems(db: PlanningDb, itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) return
	const deletedAt = new Date().toISOString()
	await runQuery("DELETE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({ deletedAt })
			.where(and(inArray(menuItemsInKitchen.id, itemIds), isNull(menuItemsInKitchen.deletedAt)))
			.then(() => undefined)
	)
}

/**
 * Aposenta o cardápio do dia que ficou sem preparação nenhuma depois de um ajuste — o do apoio
 * que foi adiado ou cancelado. Sem isto o dia continuava "com 1 refeição planejada" no
 * calendário, sem nada para produzir. Cardápio com efetivo informado fica: alguém decidiu que
 * aquela refeição acontece. A lixeira continua funcionando — restaurar um item reativa o cardápio.
 */
async function retireEmptyMenus(db: PlanningDb, menuIds: readonly (string | null)[]): Promise<void> {
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
					sql`coalesce(${dailyMenuInKitchen.forecastedHeadcount}, 0) = 0`,
					sql`not exists (select 1 from kitchen.menu_items mi where mi.daily_menu_id = ${dailyMenuInKitchen.id} and mi.deleted_at is null)`
				)
			)
			.then(() => undefined)
	)
}

/**
 * Tira do dia tudo o que UM cardápio (evento, apoio, semanal) pôs nele — a viagem cancelada,
 * o evento que não vai mais acontecer. Os itens vão para a lixeira (restauráveis); o resto do
 * dia fica como está.
 */
export async function removeOriginFromDay(db: SisubDb, ctx: UserContext, input: RemoveOriginFromDay): Promise<{ removed: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	return db.transaction(async (tx) => {
		const items = await activeItemsOfDay(tx, input.kitchenId, input.date, input.originTemplateId)
		if (items.length === 0) throw new DomainError("ORIGIN_NOT_ON_DAY", "Este cardápio não tem preparações neste dia.")
		const ids = items.map((i) => i.id)
		await assertNoStartedProduction(tx, ids)
		await softDeleteItems(tx, ids)
		await retireEmptyMenus(
			tx,
			items.map((i) => i.dailyMenuId)
		)
		return { removed: ids.length }
	})
}

/**
 * Leva para outra data tudo o que UM cardápio pôs num dia — a viagem adiada, o evento
 * remarcado. Os itens MUDAM de dia (mesmo id): porções ajustadas, trocas de preparação,
 * substitutos e tarefas de produção pendentes vão junto. Na data nova, cada item entra no
 * cardápio do mesmo tipo de refeição, que é criado quando o dia ainda não tem.
 */
export async function moveOriginToDate(db: SisubDb, ctx: UserContext, input: MoveOriginToDate): Promise<{ moved: number; menusCreated: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	if (input.toDate === input.date) throw new DomainError("SAME_DATE", "Escolha uma data diferente da atual.")
	// Para trás é quase sempre ano digitado errado: os itens cairiam num dia já servido, sumiriam de
	// todo quadro futuro e inflariam o consumo histórico. Registrar o que já passou se faz no dia.
	if (input.toDate < brasiliaCivilDate(new Date().toISOString())) {
		throw new DomainError("PAST_DATE", "A nova data já passou. Confira o dia (e o ano) escolhido.")
	}

	return db.transaction(async (tx) => {
		const items = await activeItemsOfDay(tx, input.kitchenId, input.date, input.originTemplateId)
		if (items.length === 0) throw new DomainError("ORIGIN_NOT_ON_DAY", "Este cardápio não tem preparações neste dia.")
		const ids = items.map((i) => i.id)
		await assertNoStartedProduction(tx, ids)

		// Já estar na data de destino é conflito, não soma: duas cópias do mesmo apoio no mesmo
		// dia dobrariam a produção sem ninguém ter pedido.
		const already = await activeItemsOfDay(tx, input.kitchenId, input.toDate, input.originTemplateId)
		if (already.length > 0) {
			throw new DomainError("ORIGIN_ALREADY_ON_TARGET", "Este cardápio já está na data escolhida. Tire-o de lá antes, ou ajuste as quantidades no dia.")
		}

		let menusCreated = 0
		const byMealType = new Map<string, typeof items>()
		for (const item of items) {
			// Cardápio do dia sempre tem refeição; a coluna é anulável só no schema.
			if (!item.mealTypeId) continue
			const bucket = byMealType.get(item.mealTypeId) ?? []
			bucket.push(item)
			byMealType.set(item.mealTypeId, bucket)
		}

		for (const [mealTypeId, mealItems] of byMealType) {
			const [existing] = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: dailyMenuInKitchen.id })
					.from(dailyMenuInKitchen)
					.where(
						and(
							eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
							eq(dailyMenuInKitchen.serviceDate, input.toDate),
							eq(dailyMenuInKitchen.mealTypeId, mealTypeId),
							isNull(dailyMenuInKitchen.deletedAt)
						)
					)
					.limit(1)
			)
			let targetMenuId = existing?.id
			if (!targetMenuId) {
				const [created] = await runQuery("INSERT_FAILED", () =>
					tx
						.insert(dailyMenuInKitchen)
						.values({ kitchenId: input.kitchenId, serviceDate: input.toDate, mealTypeId, status: "PLANNED" })
						.returning({ id: dailyMenuInKitchen.id })
				)
				if (!created) throw new DomainError("INSERT_FAILED", "no row returned")
				targetMenuId = created.id
				menusCreated++
			}
			const menuId = targetMenuId

			// Entra DEPOIS do que o dia de destino já tem, preservando a ordem relativa.
			const [{ maxSort } = { maxSort: null }] = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ maxSort: sql<number | null>`max(${menuItemsInKitchen.sortOrder})` })
					.from(menuItemsInKitchen)
					.where(and(eq(menuItemsInKitchen.dailyMenuId, menuId), isNull(menuItemsInKitchen.deletedAt)))
			)
			const offset = maxSort == null ? 0 : Number(maxSort) + 1
			for (const item of mealItems) {
				await runQuery("UPDATE_FAILED", () =>
					tx
						.update(menuItemsInKitchen)
						.set({ dailyMenuId: menuId, sortOrder: offset + (item.sortOrder ?? 0) })
						.where(eq(menuItemsInKitchen.id, item.id))
						.then(() => undefined)
				)
			}
		}

		// Tarefa de produção ainda pendente acompanha o item (a iniciada foi recusada acima).
		await runQuery("UPDATE_FAILED", () =>
			tx
				.update(productionTaskInKitchen)
				.set({ productionDate: input.toDate, updatedAt: new Date().toISOString() })
				.where(inArray(productionTaskInKitchen.menuItemId, ids))
				.then(() => undefined)
		)

		await retireEmptyMenus(
			tx,
			items.map((i) => i.dailyMenuId)
		)
		return { moved: ids.length, menusCreated }
	})
}

/**
 * Troca o cardápio INTEIRO do dia por um de contingência (evento ou apoio): faltou luz, faltou
 * água, o forno parou. O planejado vai para a lixeira e o de contingência entra, numa
 * transação só — nunca um dia vazio no meio. Produção de pedido de lanche fica.
 */
export async function replaceDayWithTemplate(
	db: SisubDb,
	ctx: UserContext,
	input: ReplaceDayWithTemplate
): Promise<{ removed: number; itemsCreated: number; menusCreated: number }> {
	requireKitchen(ctx, 2, input.kitchenId)
	return db.transaction(async (tx) => {
		const items = await activeItemsOfDay(tx, input.kitchenId, input.date)
		const ids = items.map((i) => i.id)
		await assertNoStartedProduction(tx, ids)
		await softDeleteItems(tx, ids)
		// Mesma materialização do "Aplicar ao calendário" (valida tipo, escopo e padrão de lanche),
		// dentro desta transação: falhar aqui desfaz também a retirada acima.
		const applied = await applyEventTemplate(tx as unknown as SisubDb, ctx, { templateId: input.templateId, kitchenId: input.kitchenId, dates: [input.date] })
		return { removed: ids.length, itemsCreated: applied.itemsCreated, menusCreated: applied.menusCreated }
	})
}

/**
 * Troca a preparação de um item do dia — faltou o alimento, entra outra — mantendo o que o
 * dia já decidiu sobre ele: porções, porcentagem, grupo, posição e a origem (evento/apoio).
 * Remover e adicionar perdia tudo isso, e o item deixava de ser "do evento".
 *
 * O motivo fica registrado no próprio item (`substitutions.recipe_swap`), que é o que a
 * Produção Cozinha mostra ao turno. Os substitutos de insumo anteriores são descartados: eles
 * se referiam aos insumos da preparação que saiu.
 */
export async function replaceMenuItemRecipe(db: SisubDb, ctx: UserContext, input: ReplaceMenuItemRecipe): Promise<MenuItem> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({
			where: and(eq(recipesInKitchen.id, input.recipeId), isNull(recipesInKitchen.deletedAt)),
			with: { recipeIngredientsInKitchens: { with: { ingredientInKitchen: true } } },
		})
	)
	if (!recipe) throw new DomainError("RECIPE_NOT_FOUND", `Recipe ${input.recipeId} not found`)
	if (recipe.kitchenId !== null && recipe.kitchenId !== kitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${input.recipeId} does not belong to kitchen ${kitchenId}`)
	}

	return db.transaction(async (tx) => {
		const [current] = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ recipeOriginId: menuItemsInKitchen.recipeOriginId, recipe: menuItemsInKitchen.recipe, deletedAt: menuItemsInKitchen.deletedAt })
				.from(menuItemsInKitchen)
				.where(eq(menuItemsInKitchen.id, input.menuItemId))
				.for("update")
		)
		if (!current || current.deletedAt != null) throw new NotFoundError("menu_item", input.menuItemId)
		if (current.recipeOriginId === input.recipeId) throw new DomainError("SAME_RECIPE", "Escolha uma preparação diferente da atual.")
		await assertNoStartedProduction(tx, [input.menuItemId])

		const previousName = (current.recipe as { name?: string } | null)?.name ?? null
		const snapshot = toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" })
		const [updated] = await runQuery("UPDATE_FAILED", () =>
			tx
				.update(menuItemsInKitchen)
				.set({
					recipeOriginId: input.recipeId,
					recipe: snapshot,
					substitutions: {
						recipe_swap: {
							type: "recipe_swap",
							rationale: input.rationale,
							updated_at: new Date().toISOString(),
							from_recipe_id: current.recipeOriginId,
							from_recipe_name: previousName,
						},
					},
				})
				.where(eq(menuItemsInKitchen.id, input.menuItemId))
				.returning()
		)
		if (!updated) throw new NotFoundError("menu_item", input.menuItemId)
		return toWire<MenuItem>(updated)
	})
}

/** Substituto cadastrado na ficha para um insumo da preparação (insumo ou preparação congelada). */
export type SubstituteOption = {
	kind: "ingredient" | "frozen_preparation"
	id: string
	description: string | null
	measure_unit: string | null
	net_quantity: number | null
}

/**
 * Substitutos que a ficha técnica já prevê para cada insumo de um item do dia
 * (`recipe_ingredient_alternatives`, por prioridade), indexados pelo `recipe_ingredient` do
 * snapshot. Insumo descontinuado fica de fora; preparação congelada prevista entra — é
 * justamente o que costuma estar no freezer quando o fresco falta.
 */
export async function fetchMenuItemSubstituteOptions(
	db: SisubDb,
	ctx: UserContext,
	input: MenuItemSubstituteOptions
): Promise<Record<string, SubstituteOption[]>> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 1, kitchenId)

	const [item] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ recipe: menuItemsInKitchen.recipe })
			.from(menuItemsInKitchen)
			.where(and(eq(menuItemsInKitchen.id, input.menuItemId), isNull(menuItemsInKitchen.deletedAt)))
			.limit(1)
	)
	if (!item) throw new NotFoundError("menu_item", input.menuItemId)
	const lines = ((item.recipe as { ingredients?: { id?: string }[] } | null)?.ingredients ?? []).flatMap((l) => (l.id ? [l.id] : []))
	if (lines.length === 0) return {}

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				recipeIngredientId: recipeIngredientAlternativesInKitchen.recipeIngredientId,
				ingredientId: recipeIngredientAlternativesInKitchen.ingredientId,
				frozenPreparationId: recipeIngredientAlternativesInKitchen.frozenPreparationId,
				netQuantity: recipeIngredientAlternativesInKitchen.netQuantity,
				ingredientDescription: ingredientInKitchen.description,
				ingredientUnit: ingredientInKitchen.measureUnit,
				ingredientDeletedAt: ingredientInKitchen.deletedAt,
				frozenDescription: frozenPreparationInKitchen.description,
				frozenUnit: frozenPreparationInKitchen.measureUnit,
				frozenDeletedAt: frozenPreparationInKitchen.deletedAt,
			})
			.from(recipeIngredientAlternativesInKitchen)
			.leftJoin(ingredientInKitchen, eq(recipeIngredientAlternativesInKitchen.ingredientId, ingredientInKitchen.id))
			.leftJoin(frozenPreparationInKitchen, eq(recipeIngredientAlternativesInKitchen.frozenPreparationId, frozenPreparationInKitchen.id))
			.where(inArray(recipeIngredientAlternativesInKitchen.recipeIngredientId, lines))
			.orderBy(recipeIngredientAlternativesInKitchen.priorityOrder)
	)
	const out: Record<string, SubstituteOption[]> = {}
	for (const row of rows) {
		let option: SubstituteOption | null = null
		if (row.ingredientId && row.ingredientDeletedAt == null && row.ingredientDescription != null) {
			option = {
				kind: "ingredient",
				id: row.ingredientId,
				description: row.ingredientDescription,
				measure_unit: row.ingredientUnit,
				net_quantity: row.netQuantity,
			}
		} else if (row.frozenPreparationId && row.frozenDeletedAt == null && row.frozenDescription != null) {
			option = {
				kind: "frozen_preparation",
				id: row.frozenPreparationId,
				description: row.frozenDescription,
				measure_unit: row.frozenUnit,
				net_quantity: row.netQuantity,
			}
		}
		if (!option) continue
		const list = out[row.recipeIngredientId] ?? []
		list.push(option)
		out[row.recipeIngredientId] = list
	}
	return out
}

/**
 * Registra UM substituto de insumo no item do dia — merge atômico no JSON `substitutions`
 * (`jsonb ||`), como o do turno (`recordProductionSubstitution`). Reescrever o mapa inteiro a
 * partir do que a tela tinha em memória apagava o registro que o turno gravou nesse meio-tempo.
 */
export async function recordMenuSubstitution(db: SisubDb, ctx: UserContext, input: RecordMenuSubstitution): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const entry: SubstitutionEntry = {
		type: "manual",
		rationale: input.rationale,
		updated_at: new Date().toISOString(),
		substitute_ingredient_id: input.substituteIngredientId ?? null,
		substitute_description: input.substituteDescription,
	}
	const updated = await runQuery("UPDATE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({
				substitutions: sql`(coalesce(${menuItemsInKitchen.substitutions}::jsonb, '{}'::jsonb) || ${JSON.stringify({ [input.ingredientId]: entry })}::jsonb)::json`,
			})
			.where(and(eq(menuItemsInKitchen.id, input.menuItemId), isNull(menuItemsInKitchen.deletedAt)))
			.returning({ id: menuItemsInKitchen.id })
	)
	if (updated.length === 0) throw new NotFoundError("menu_item", input.menuItemId)
}
