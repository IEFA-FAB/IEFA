/**
 * Planning operations — Drizzle query layer (migração PostgREST→Drizzle).
 *
 * O contrato de retorno é PRESERVADO (snake_case aninhado) via `toWire()` — o Drizzle
 * devolve colunas em camelCase. Bugfixes vs sisub divergence preservados:
 *   - addMenuItem validates recipe kitchen_id (was missing in sisub)
 *   - fetchDailyMenus filters menu_items in DB query (not in memory) — agora no SQL via
 *     `where: isNull(...)` dentro do `with` aninhado.
 */

import { dailyMenuInKitchen, menuGroupInKitchen, menuGroupSetInKitchen, menuItemsInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import { assertMealTypeForKitchen, resolveKitchenFromMenu, resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import { MAX_RECOMMENDED_PROPORTION } from "../schemas/common.ts"
import type { FetchDailyMenuContent } from "../schemas/meal-ops.ts"
import { DEFAULT_GROUP_SET_SLUG } from "../schemas/menu-groups.ts"
import type {
	AddMenuItem,
	DailyMenuFetch,
	DayDetailsFetch,
	GetTrashItems,
	RemoveMenuItem,
	RestoreMenuItem,
	UpdateHeadcount,
	UpdateMenuItem,
	UpsertDailyMenu,
} from "../schemas/planning.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { mutateOrFail, runQuery, toWire } from "../utils/index.ts"
import { demandRoundingFor, resolveItemDemand } from "./demand-math.ts"
import { assertItemGroupsInSet } from "./menu-groups.ts"

// ── Wire contract (snake_case aninhado, idêntico ao que o PostgREST devolvia) ──

type DailyMenu = Tables<"daily_menu">
type MenuItem = Tables<"menu_items">
type MealType = Tables<"meal_type">
type Recipe = Tables<"recipes">

type MenuItemWithOrigin = MenuItem & { recipe_origin: Recipe | null }
type DailyMenuWithItems = DailyMenu & { meal_type: MealType | null; menu_items: MenuItemWithOrigin[] }
// daily_menu é garantido não-nulo: a query era `daily_menu!inner(*)` e filtramos por kitchen_id.
type TrashMenuItem = MenuItem & { recipe_origin: Recipe | null; daily_menu: DailyMenu }

/**
 * Relations da query relacional do Drizzle nomeadas de forma "feia" pelo `drizzle-kit pull`.
 * Passadas a `toWire()` para renomear às chaves do contrato (o resto vira snake_case).
 */
const DAILY_MENU_RELATIONS: Record<string, string> = {
	mealTypeInKitchen: "meal_type",
	menuItemsInKitchens: "menu_items",
	recipesInKitchen: "recipe_origin",
}

// Relational `with` para daily_menu + meal_type + menu_items ativos (+ recipe_origin).
const WITH_MENU_ITEMS = {
	mealTypeInKitchen: true,
	menuItemsInKitchens: {
		// Filtra soft-deleted no SQL (Drizzle permite where em relation aninhada — PostgREST não).
		where: isNull(menuItemsInKitchen.deletedAt),
		// Ordem estável dentro da refeição (posição do grupo). Agrupamento por item_group é do consumidor.
		orderBy: asc(menuItemsInKitchen.sortOrder),
		with: { recipesInKitchen: true },
	},
} as const

export async function fetchDailyMenus(db: SisubDb, ctx: UserContext, input: DailyMenuFetch): Promise<DailyMenuWithItems[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			where: and(
				eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
				gte(dailyMenuInKitchen.serviceDate, input.startDate),
				lte(dailyMenuInKitchen.serviceDate, input.endDate),
				isNull(dailyMenuInKitchen.deletedAt)
			),
			with: WITH_MENU_ITEMS,
			orderBy: [asc(dailyMenuInKitchen.serviceDate), asc(dailyMenuInKitchen.mealTypeId)],
		})
	)

	return rows.map((row) => toWire<DailyMenuWithItems>(row, DAILY_MENU_RELATIONS))
}

export async function fetchDayDetails(db: SisubDb, ctx: UserContext, input: DayDetailsFetch): Promise<DailyMenuWithItems[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
			with: WITH_MENU_ITEMS,
		})
	)

	return rows.map((row) => toWire<DailyMenuWithItems>(row, DAILY_MENU_RELATIONS))
}

export async function upsertDailyMenu(db: SisubDb, ctx: UserContext, input: UpsertDailyMenu): Promise<DailyMenu[]> {
	requireKitchen(ctx, 2, input.kitchenId)
	// Refeição global ou desta cozinha, ativa e não de sistema — a mesma regra de incluir no dia.
	await assertMealTypeForKitchen(db, input.mealTypeId, input.kitchenId)

	// "Cria se não existir, senão mantém" (idempotente). A unicidade do trio (data, refeição,
	// cozinha) é garantida por um índice PARCIAL (where deleted_at is null). O select poupa o
	// insert no caso comum; o insert repete o predicado do índice no `on conflict` (sem ele o
	// Postgres não infere o índice e responde 42P10) e, se outra chamada criou o mesmo menu entre
	// o select e o insert, o `do nothing` volta vazio e a releitura devolve o dela.
	const findActive = () =>
		runQuery("UPSERT_FAILED", () =>
			db.query.dailyMenuInKitchen.findFirst({
				where: and(
					eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
					eq(dailyMenuInKitchen.serviceDate, input.serviceDate),
					eq(dailyMenuInKitchen.mealTypeId, input.mealTypeId),
					isNull(dailyMenuInKitchen.deletedAt)
				),
			})
		)

	const existing = await findActive()
	if (existing) return [toWire<DailyMenu>(existing)]

	const inserted = await runQuery("UPSERT_FAILED", () =>
		db
			.insert(dailyMenuInKitchen)
			.values({
				kitchenId: input.kitchenId,
				serviceDate: input.serviceDate,
				mealTypeId: input.mealTypeId,
				status: "PLANNED",
				...(input.forecastedHeadcount != null && { forecastedHeadcount: input.forecastedHeadcount }),
			})
			.onConflictDoNothing({
				target: [dailyMenuInKitchen.serviceDate, dailyMenuInKitchen.mealTypeId, dailyMenuInKitchen.kitchenId],
				where: sql`deleted_at is null`,
			})
			.returning()
	)
	if (inserted.length > 0) return inserted.map((row) => toWire<DailyMenu>(row))

	const raced = await findActive()
	if (!raced) throw new DomainError("UPSERT_FAILED", "no row returned")
	return [toWire<DailyMenu>(raced)]
}

/** Próxima posição livre no fim de um grupo dentro do cardápio do dia (itens ativos). */
/** Refeição de um cardápio do dia — para validar o grupo contra o conjunto dela. */
async function mealTypeOfMenu(db: SisubDb, dailyMenuId: string): Promise<string | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findFirst({ columns: { mealTypeId: true }, where: eq(dailyMenuInKitchen.id, dailyMenuId) })
	)
	return row?.mealTypeId ?? null
}

async function mealTypeOfMenuItem(db: SisubDb, menuItemId: string): Promise<string | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuItemsInKitchen.findFirst({
			columns: { id: true },
			with: { dailyMenuInKitchen: { columns: { mealTypeId: true } } },
			where: eq(menuItemsInKitchen.id, menuItemId),
		})
	)
	return row?.dailyMenuInKitchen?.mealTypeId ?? null
}

async function nextSortOrder(db: SisubDb, dailyMenuId: string, itemGroup: string | null): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.menuItemsInKitchen.findMany({
			columns: { sortOrder: true },
			where: and(
				eq(menuItemsInKitchen.dailyMenuId, dailyMenuId),
				itemGroup === null ? isNull(menuItemsInKitchen.itemGroup) : eq(menuItemsInKitchen.itemGroup, itemGroup),
				isNull(menuItemsInKitchen.deletedAt)
			),
		})
	)
	return rows.reduce((max, r) => Math.max(max, (r.sortOrder ?? 0) + 1), 0)
}

/** Próxima posição no fim do grupo destino, resolvendo o cardápio do próprio item. */
async function nextSortOrderForItem(db: SisubDb, menuItemId: string, itemGroup: string | null): Promise<number> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuItemsInKitchen.findFirst({ columns: { dailyMenuId: true }, where: eq(menuItemsInKitchen.id, menuItemId) })
	)
	if (!row?.dailyMenuId) return 0
	return nextSortOrder(db, row.dailyMenuId, itemGroup)
}

export async function addMenuItem(db: SisubDb, ctx: UserContext, input: AddMenuItem): Promise<MenuItem[]> {
	const kitchenId = await resolveKitchenFromMenu(db, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	// Fetch full recipe (includes kitchen_id) — replaces separate validateRecipeAccess call.
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

	// Snapshot da receita gravado em JSON no contrato snake_case (idêntico ao PostgREST).
	const recipeSnapshot = toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" })

	// Item incluído à mão no dia não é de apoio: "% do efetivo", teto de 300.
	assertDayProportionCap(null, input.recommendedProportion ?? null)
	const itemGroup = input.itemGroup ?? null
	// O CHECK de item_group saiu do banco e `add_menu_item` é tool de MCP: sem isto
	// o modelo grava uma chave que nenhum conjunto tem e o item nasce órfão.
	if (itemGroup) await assertItemGroupsInSet(db, [{ mealTypeId: await mealTypeOfMenu(db, input.dailyMenuId), itemGroup }])
	// Sem sortOrder explícito → posiciona no fim do grupo dentro do cardápio.
	const sortOrder = input.sortOrder ?? (await nextSortOrder(db, input.dailyMenuId, itemGroup))

	const inserted = await mutateOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(menuItemsInKitchen)
			.values({
				dailyMenuId: input.dailyMenuId,
				recipeOriginId: input.recipeId,
				recipe: recipeSnapshot,
				...(input.plannedPortionQuantity != null && { plannedPortionQuantity: input.plannedPortionQuantity }),
				...(input.excludedFromProcurement != null && { excludedFromProcurement: input.excludedFromProcurement }),
				itemGroup,
				sortOrder,
				recommendedProportion: input.recommendedProportion ?? null,
			})
			.returning()
	)
	return inserted.map((row) => toWire<MenuItem>(row))
}

export async function updateMenuItem(db: SisubDb, ctx: UserContext, input: UpdateMenuItem): Promise<MenuItem[]> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const updates: {
		plannedPortionQuantity?: number
		excludedFromProcurement?: number
		itemGroup?: string | null
		sortOrder?: number
		recommendedProportion?: number | null
	} = {}
	if (input.plannedPortionQuantity != null) updates.plannedPortionQuantity = input.plannedPortionQuantity
	if (input.excludedFromProcurement != null) updates.excludedFromProcurement = input.excludedFromProcurement
	if (input.recommendedProportion !== undefined) {
		updates.recommendedProportion = input.recommendedProportion ?? null
		const current = await fetchItemSizing(db, input.menuItemId)
		assertDayProportionCap(current?.originTemplateType ?? null, input.recommendedProportion ?? null)
		// A proporção é o que dimensiona o item; as porções planejadas são o que produção,
		// baixa e compra usam. Mudar uma sem a outra deixava 150% gravado e 120 porções na
		// cozinha. Recalcula se as porções ainda são as derivadas da proporção antiga.
		if (input.plannedPortionQuantity == null && current) {
			const next = portionsForNewProportion(current, input.recommendedProportion ?? null)
			if (next != null) updates.plannedPortionQuantity = next
		}
	}

	if (input.itemGroup !== undefined) {
		if (input.itemGroup) await assertItemGroupsInSet(db, [{ mealTypeId: await mealTypeOfMenuItem(db, input.menuItemId), itemGroup: input.itemGroup }])
		updates.itemGroup = input.itemGroup
		// Trocar de grupo sem posição explícita → recoloca o item no fim do grupo destino
		// (evita colisão de sort_order herdado do grupo anterior).
		updates.sortOrder = input.sortOrder ?? (await nextSortOrderForItem(db, input.menuItemId, input.itemGroup))
	} else if (input.sortOrder !== undefined) {
		updates.sortOrder = input.sortOrder
	}

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const updated = await runQuery("UPDATE_FAILED", () =>
		db.update(menuItemsInKitchen).set(updates).where(eq(menuItemsInKitchen.id, input.menuItemId)).returning()
	)
	return updated.map((row) => toWire<MenuItem>(row))
}

type ItemSizing = { planned: number | null; proportion: number | null; headcount: number | null; originTemplateType: string | null }

async function fetchItemSizing(db: SisubDb, menuItemId: string): Promise<ItemSizing | null> {
	const [row] = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				planned: menuItemsInKitchen.plannedPortionQuantity,
				proportion: menuItemsInKitchen.recommendedProportion,
				headcount: dailyMenuInKitchen.forecastedHeadcount,
				originTemplateType: menuItemsInKitchen.originTemplateType,
			})
			.from(menuItemsInKitchen)
			.innerJoin(dailyMenuInKitchen, eq(menuItemsInKitchen.dailyMenuId, dailyMenuInKitchen.id))
			.where(eq(menuItemsInKitchen.id, menuItemId))
	)
	if (!row) return null
	return {
		planned: row.planned == null ? null : Number(row.planned),
		proportion: row.proportion == null ? null : Number(row.proportion),
		headcount: row.headcount,
		originTemplateType: row.originTemplateType,
	}
}

/**
 * Teto da proporção no item do dia: o esquema aceita até 1000 porque no apoio ela é porções por
 * kit; nos demais itens ela é "% do efetivo" e o teto continua 300.
 */
function assertDayProportionCap(originTemplateType: string | null, proportion: number | null): void {
	if (originTemplateType === "apoio" || proportion == null || proportion <= MAX_RECOMMENDED_PROPORTION) return
	throw new DomainError("RECOMMENDED_PROPORTION_ABOVE_CAP", `Proporção de ${proportion}% passa do teto de ${MAX_RECOMMENDED_PROPORTION}% do efetivo.`)
}

/**
 * Porções do item quando a proporção muda — `null` se foram ajustadas à mão ou não há base.
 *
 * Item de evento ou apoio não mede pelo efetivo da rotina daquele horário: a base dele é a
 * refeição do evento (ou os kits), que o item do dia não guarda. Ela é recuperada das próprias
 * porções (240 porções a 60% = base 400); sem porções, não há base e nada muda.
 */
export function portionsForNewProportion(item: ItemSizing, newProportion: number | null): number | null {
	if (item.originTemplateType === "event" || item.originTemplateType === "apoio") {
		if (item.planned == null || item.proportion == null || item.proportion <= 0 || newProportion == null) return null
		const base = Math.round((item.planned * 100) / item.proportion)
		return resolveItemDemand({ baseHeadcount: base, recommendedProportion: newProportion, rounding: demandRoundingFor(item.originTemplateType) })
	}
	if (item.headcount == null) return null
	const derivedOld = resolveItemDemand({ baseHeadcount: item.headcount, recommendedProportion: item.proportion })
	if (item.planned != null && item.planned !== derivedOld) return null
	return resolveItemDemand({ baseHeadcount: item.headcount, recommendedProportion: newProportion })
}

export async function removeMenuItem(db: SisubDb, ctx: UserContext, input: RemoveMenuItem): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await runQuery("DELETE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(menuItemsInKitchen.id, input.menuItemId))
			.then(() => undefined)
	)
}

export async function restoreMenuItem(db: SisubDb, ctx: UserContext, input: RestoreMenuItem): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await db.transaction(async (tx) => {
		const [row] = await runQuery("FETCH_FAILED", () =>
			tx
				.select({
					dailyMenuId: menuItemsInKitchen.dailyMenuId,
					menuDeletedAt: dailyMenuInKitchen.deletedAt,
					serviceDate: dailyMenuInKitchen.serviceDate,
					mealTypeId: dailyMenuInKitchen.mealTypeId,
					menuKitchenId: dailyMenuInKitchen.kitchenId,
					originSnackRequestId: menuItemsInKitchen.originSnackRequestId,
				})
				.from(menuItemsInKitchen)
				.leftJoin(dailyMenuInKitchen, eq(menuItemsInKitchen.dailyMenuId, dailyMenuInKitchen.id))
				.where(eq(menuItemsInKitchen.id, input.menuItemId))
				.limit(1)
		)

		// Para onde o item volta. Se o menu dele está ativo, fica onde estava. Se caiu junto
		// (aplicação com "Substituir"), há dois casos:
		//   - já existe OUTRO menu ativo na mesma data/refeição/cozinha — o que o Substituir
		//     criou. Reativar o antigo violaria `daily_menu_active_unique` e a restauração
		//     inteira falharia; o item entra no menu ativo;
		//   - não existe: o menu antigo é reativado. Sem isso o item restaurado ficaria
		//     invisível, porque toda leitura do calendário filtra menu excluído.
		if (row?.originSnackRequestId) {
			throw new DomainError("SNACK_ITEM_NOT_RESTORABLE", "Item de pedido de lanche volta ao quadro pelo pedido, não pela lixeira.")
		}
		let targetMenuId = row?.dailyMenuId ?? null
		if (row?.dailyMenuId && row.menuDeletedAt != null && row.serviceDate && row.mealTypeId && row.menuKitchenId != null) {
			const [active] = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: dailyMenuInKitchen.id })
					.from(dailyMenuInKitchen)
					.where(
						and(
							eq(dailyMenuInKitchen.serviceDate, row.serviceDate as string),
							eq(dailyMenuInKitchen.mealTypeId, row.mealTypeId as string),
							eq(dailyMenuInKitchen.kitchenId, row.menuKitchenId as number),
							isNull(dailyMenuInKitchen.deletedAt)
						)
					)
					.limit(1)
			)
			if (active) {
				targetMenuId = active.id
			} else {
				await runQuery("RESTORE_FAILED", () =>
					tx
						.update(dailyMenuInKitchen)
						.set({ deletedAt: null })
						.where(eq(dailyMenuInKitchen.id, row.dailyMenuId as string))
						.then(() => undefined)
				)
			}
		}

		await runQuery("RESTORE_FAILED", () =>
			tx
				.update(menuItemsInKitchen)
				.set(targetMenuId ? { deletedAt: null, dailyMenuId: targetMenuId } : { deletedAt: null })
				.where(eq(menuItemsInKitchen.id, input.menuItemId))
				.then(() => undefined)
		)
	})
}

export async function updateHeadcount(db: SisubDb, ctx: UserContext, input: UpdateHeadcount): Promise<DailyMenu[]> {
	const kitchenId = await resolveKitchenFromMenu(db, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	// Previsão e porções andam juntas. A previsão do dia virava 300 e os itens seguiam em
	// 380 — e são as porções dos itens que a produção, a baixa do estoque e a compra datada
	// usam. Reescala só o item cujas porções VIERAM da previsão (= previsão antiga × proporção);
	// o que alguém ajustou à mão fica como está.
	const updated = await db.transaction(async (tx) => {
		const [before] = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ forecastedHeadcount: dailyMenuInKitchen.forecastedHeadcount })
				.from(dailyMenuInKitchen)
				.where(eq(dailyMenuInKitchen.id, input.dailyMenuId))
				.for("update")
		)
		const rows = await runQuery("UPDATE_FAILED", () =>
			tx.update(dailyMenuInKitchen).set({ forecastedHeadcount: input.forecastedHeadcount }).where(eq(dailyMenuInKitchen.id, input.dailyMenuId)).returning()
		)
		const oldHeadcount = before?.forecastedHeadcount ?? null
		// Efetivo que chega depois (dia aplicado com "efetivo a definir", típico do modelo global):
		// calcula a porção de quem ainda não tem, pela proporção. Porção já preenchida fica.
		// Um UPDATE só, pela regra de `portionsForArrivingHeadcount` (round do "% do efetivo"; item
		// de evento/apoio fica: ele mede pela refeição dele, não pela rotina).
		if (oldHeadcount == null && input.forecastedHeadcount != null) {
			await runQuery("UPDATE_FAILED", () =>
				tx
					.update(menuItemsInKitchen)
					.set({
						plannedPortionQuantity: sql`round(${input.forecastedHeadcount}::numeric * coalesce(${menuItemsInKitchen.recommendedProportion}, 100) / 100)`,
					})
					.where(
						and(
							eq(menuItemsInKitchen.dailyMenuId, input.dailyMenuId),
							isNull(menuItemsInKitchen.deletedAt),
							isNull(menuItemsInKitchen.plannedPortionQuantity),
							sql`coalesce(${menuItemsInKitchen.originTemplateType}, '') not in ('event', 'apoio')`
						)
					)
					.then(() => undefined)
			)
		}
		if (oldHeadcount != null && oldHeadcount !== input.forecastedHeadcount) {
			const items = await runQuery("FETCH_FAILED", () =>
				tx
					.select({
						id: menuItemsInKitchen.id,
						planned: menuItemsInKitchen.plannedPortionQuantity,
						proportion: menuItemsInKitchen.recommendedProportion,
						originTemplateType: menuItemsInKitchen.originTemplateType,
					})
					.from(menuItemsInKitchen)
					.where(and(eq(menuItemsInKitchen.dailyMenuId, input.dailyMenuId), isNull(menuItemsInKitchen.deletedAt)))
			)
			for (const item of items) {
				// Item de evento ou apoio não segue o efetivo da rotina (ver `portionsForArrivingHeadcount`).
				if (item.originTemplateType === "event" || item.originTemplateType === "apoio") continue
				const next = rescaledPortions({
					planned: item.planned == null ? null : Number(item.planned),
					proportion: item.proportion == null ? null : Number(item.proportion),
					oldHeadcount,
					newHeadcount: input.forecastedHeadcount,
				})
				if (next == null) continue
				await runQuery("UPDATE_FAILED", () =>
					tx
						.update(menuItemsInKitchen)
						.set({ plannedPortionQuantity: next })
						.where(eq(menuItemsInKitchen.id, item.id))
						.then(() => undefined)
				)
			}
		}
		return rows
	})
	return updated.map((row) => toWire<DailyMenu>(row))
}

/**
 * Novas porções de um item quando a previsão da refeição muda — ou `null` para não mexer.
 *
 * Só reescala o item que ainda está no valor derivado da previsão antiga (com a proporção,
 * se houver); porções digitadas à mão são decisão de alguém e ficam.
 */
export function rescaledPortions(input: { planned: number | null; proportion: number | null; oldHeadcount: number; newHeadcount: number }): number | null {
	const derive = (headcount: number) => resolveItemDemand({ baseHeadcount: headcount, recommendedProportion: input.proportion })
	const derivedOld = derive(input.oldHeadcount)
	if (input.planned == null || derivedOld == null || input.planned !== derivedOld) return null
	const derivedNew = derive(input.newHeadcount)
	return derivedNew === input.planned ? null : derivedNew
}

/**
 * Porções de um item SEM porção quando o efetivo da refeição chega (antes vazio) — ou `null`
 * para não mexer. Item de evento ou apoio fica: ele mede pela refeição do evento ou pelos kits
 * do apoio, não pelo efetivo da rotina daquele horário.
 */
export function portionsForArrivingHeadcount(input: { proportion: number | null; originTemplateType: string | null; headcount: number }): number | null {
	if (input.originTemplateType === "event" || input.originTemplateType === "apoio") return null
	return resolveItemDemand({ baseHeadcount: input.headcount, recommendedProportion: input.proportion })
}

export async function getTrashItems(db: SisubDb, ctx: UserContext, input: GetTrashItems): Promise<TrashMenuItem[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	// daily_menu!inner + filtro por kitchen_id no SQL (join), não em JS — não varre o lixo de
	// outras cozinhas. Itens órfãos (daily_menu hard-deletado) ficam de fora pelo inner join.
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ item: menuItemsInKitchen, recipe_origin: recipesInKitchen, daily_menu: dailyMenuInKitchen })
			.from(menuItemsInKitchen)
			.innerJoin(dailyMenuInKitchen, eq(menuItemsInKitchen.dailyMenuId, dailyMenuInKitchen.id))
			.leftJoin(recipesInKitchen, eq(menuItemsInKitchen.recipeOriginId, recipesInKitchen.id))
			// Item de pedido de lanche cancelado não é lixo restaurável: quem o tirou do quadro foi
			// o cancelamento do pedido, e restaurá-lo produziria lanche para pedido cancelado.
			.where(and(isNotNull(menuItemsInKitchen.deletedAt), eq(dailyMenuInKitchen.kitchenId, input.kitchenId), isNull(menuItemsInKitchen.originSnackRequestId)))
			.orderBy(desc(menuItemsInKitchen.deletedAt))
	)

	return rows.map((r) => ({
		...toWire<MenuItem>(r.item),
		recipe_origin: r.recipe_origin ? toWire<Recipe>(r.recipe_origin) : null,
		daily_menu: toWire<DailyMenu>(r.daily_menu),
	}))
}

// ─── Aggregated daily menu content (diner-facing) ───────────────────────────

/**
 * O que o comensal lê de cada ingrediente: o NOME, e só. A ficha técnica (quantidades líquidas
 * do rendimento inteiro, fator de correção, ids, a linha completa do insumo) é dado de
 * planejamento da cozinha; a tela do comensal só lista a composição do prato.
 */
type DishIngredient = { ingredient_name: string }
type DishDetails = {
	id: string
	name: string
	ingredients: DishIngredient[]
	/** Chave do grupo, como gravada em `item_group`. */
	group: string | null
	/** Rótulo do grupo no conjunto da refeição; null quando a chave não está nele. */
	group_label: string | null
	/** Posição do grupo na ordem de leitura do conjunto (fora dele vai para o fim). */
	group_order: number
	recommended_proportion: number | null
}
type DayMenuContent = { [date: string]: { [mealKey: string]: DishDetails[] } }
/** Linha de ingrediente como o snapshot de `menu_items.recipe` a grava (`recipe_ingredients` + insumo). */
type SnapshotIngredient = { deleted_at?: string | null; ingredient?: { description?: string | null } | null }
type RecipeSnapshot = { name?: string; ingredients?: SnapshotIngredient[] | null }

/**
 * Composição do prato para o comensal: nomes dos insumos ativos do snapshot, sem repetição, na
 * ordem da ficha. Linha de preparação congelada não traz o insumo no snapshot e fica de fora.
 */
function toDishIngredients(snapshot: RecipeSnapshot): DishIngredient[] {
	if (!Array.isArray(snapshot.ingredients)) return []
	const names = new Set<string>()
	for (const row of snapshot.ingredients) {
		if (row?.deleted_at) continue
		const name = row?.ingredient?.description?.trim()
		if (name) names.add(name)
	}
	return [...names].map((ingredient_name) => ({ ingredient_name }))
}

function mapMealTypeNameToKey(name: string): string | null {
	const lower = name.toLowerCase()
	if (lower.includes("café")) return "cafe"
	if (lower.includes("almoço")) return "almoco"
	if (lower.includes("jantar")) return "janta"
	if (lower.includes("ceia")) return "ceia"
	return null
}

/**
 * Returns a nested map of dishes per date per meal key for the given kitchens and
 * date range. Dish name prefers the recipe JSON snapshot, falling back to
 * recipe_origin.name then "Prato sem nome"; ingredients come from the snapshot only,
 * projected to names (`toDishIngredients`).
 *
 * Leitura do COMENSAL: exige `diner:1` (implícito para toda conta; um deny de `diner` derruba).
 * Sem escopo de cozinha de propósito: o comensal escolhe o refeitório de qualquer dia, e o
 * cardápio publicado não é segredo. O que o protege é a projeção (nada da ficha técnica sai
 * daqui) e o teto de cozinhas e de dias no schema. Nenhuma tela de cozinha usa esta operação.
 */
export async function fetchDailyMenuContent(db: SisubDb, ctx: UserContext, input: FetchDailyMenuContent): Promise<DayMenuContent> {
	requirePermission(ctx, "diner", 1)
	if (input.kitchenIds.length === 0) return {}
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { serviceDate: true, kitchenId: true },
			with: {
				mealTypeInKitchen: { columns: { name: true, groupSetId: true } },
				menuItemsInKitchens: {
					// Não devolver itens soft-deleted ao diner (paridade com as demais queries do arquivo).
					where: isNull(menuItemsInKitchen.deletedAt),
					// Ordem estável de leitura (arroz antes de feijão): posição dentro do grupo.
					orderBy: asc(menuItemsInKitchen.sortOrder),
					columns: { id: true, recipe: true, itemGroup: true, recommendedProportion: true },
					with: { recipesInKitchen: { columns: { name: true } } },
				},
			},
			where: and(
				inArray(dailyMenuInKitchen.kitchenId, input.kitchenIds),
				gte(dailyMenuInKitchen.serviceDate, input.startDate),
				lte(dailyMenuInKitchen.serviceDate, input.endDate),
				// Não vazar daily_menu soft-deleted (ex.: apagado por applyTemplate) ao diner.
				isNull(dailyMenuInKitchen.deletedAt)
			),
		})
	)

	// Rótulo e ordem de leitura dos grupos saem do CONJUNTO da refeição. Vão junto
	// com o prato de propósito: a visão do comensal exige `diner:1` e não alcança
	// `kitchen.menu_group_set` por conta própria — buscar o conjunto na tela
	// devolveria 403 e a tela perderia os cabeçalhos sem dizer por quê.
	//
	// Refeição sem conjunto (linha antiga) cai no conjunto PADRÃO, como no editor.
	// Deixá-la sem rótulo empataria todos os pratos no fim da ordenação e a tela do
	// comensal mostraria as seções em ordem arbitrária, com a chave crua no lugar do
	// rótulo — a ordenação canônica que o cliente fazia sozinho não existe mais.
	const needsDefault = rows.some((r) => r.mealTypeInKitchen != null && r.mealTypeInKitchen.groupSetId == null)
	const defaultSetId = needsDefault
		? ((
				await runQuery("FETCH_FAILED", () =>
					db
						.select({ id: menuGroupSetInKitchen.id })
						.from(menuGroupSetInKitchen)
						.where(and(eq(menuGroupSetInKitchen.slug, DEFAULT_GROUP_SET_SLUG), isNull(menuGroupSetInKitchen.deletedAt)))
						.limit(1)
				)
			)[0]?.id ?? null)
		: null

	const setIds = [...new Set([...rows.map((r) => r.mealTypeInKitchen?.groupSetId), defaultSetId].filter((id): id is string => id != null))]
	const groupsBySet = new Map<string, Map<string, { label: string; order: number }>>()
	if (setIds.length > 0) {
		const groupRows = await runQuery("FETCH_FAILED", () =>
			db
				.select({
					groupSetId: menuGroupInKitchen.groupSetId,
					key: menuGroupInKitchen.key,
					label: menuGroupInKitchen.label,
					sortOrder: menuGroupInKitchen.sortOrder,
				})
				.from(menuGroupInKitchen)
				.where(inArray(menuGroupInKitchen.groupSetId, setIds))
				.orderBy(asc(menuGroupInKitchen.sortOrder))
		)
		for (const g of groupRows) {
			const bucket = groupsBySet.get(g.groupSetId) ?? new Map()
			bucket.set(g.key, { label: g.label, order: g.sortOrder })
			groupsBySet.set(g.groupSetId, bucket)
		}
	}

	const content: DayMenuContent = {}

	for (const menu of rows) {
		const date = menu.serviceDate
		if (!date) continue

		const mealName = menu.mealTypeInKitchen?.name
		if (!mealName) continue

		const mealKey = mapMealTypeNameToKey(mealName)
		if (!mealKey) continue

		if (!content[date]) content[date] = {}
		if (!content[date][mealKey]) content[date][mealKey] = []

		for (const item of menu.menuItemsInKitchens ?? []) {
			let dishName = "Prato sem nome"
			let ingredients: DishIngredient[] = []

			if (item.recipe) {
				const snapshot = item.recipe as RecipeSnapshot
				dishName = snapshot?.name || dishName
				ingredients = toDishIngredients(snapshot)
			} else if (item.recipesInKitchen?.name) {
				dishName = item.recipesInKitchen.name || dishName
			}

			const proportion = item.recommendedProportion == null ? null : Number(item.recommendedProportion)
			const setId = menu.mealTypeInKitchen?.groupSetId ?? defaultSetId
			const group = setId ? groupsBySet.get(setId)?.get(item.itemGroup ?? "") : undefined
			content[date][mealKey].push({
				id: item.id,
				name: dishName,
				ingredients,
				group: item.itemGroup ?? null,
				group_label: group?.label ?? null,
				// Chave fora do conjunto (ou sem grupo) vai para o fim, como no editor.
				group_order: group?.order ?? Number.MAX_SAFE_INTEGER,
				recommended_proportion: proportion,
			})
		}
	}

	// A ordem que chega à tela é a de LEITURA do cardápio: grupo do conjunto e,
	// dentro dele, a posição. A query já traz por sort_order; sem esta passada os
	// grupos sairiam intercalados.
	for (const day of Object.values(content)) {
		for (const dishes of Object.values(day)) {
			dishes.sort((a, b) => a.group_order - b.group_order)
		}
	}

	return content
}
