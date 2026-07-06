/**
 * Planning operations — Drizzle query layer (migração PostgREST→Drizzle).
 *
 * O contrato de retorno é PRESERVADO (snake_case aninhado) via `toWire()` — o Drizzle
 * devolve colunas em camelCase. Bugfixes vs sisub divergence preservados:
 *   - addMenuItem validates recipe kitchen_id (was missing in sisub)
 *   - fetchDailyMenus filters menu_items in DB query (not in memory) — agora no SQL via
 *     `where: isNull(...)` dentro do `with` aninhado.
 */

import { dailyMenuInKitchen, menuItemsInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm"
import { requireKitchen } from "../guards/require-permission.ts"
import { resolveKitchenFromMenu, resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import type { FetchDailyMenuContent } from "../schemas/meal-ops.ts"
import type {
	AddMenuItem,
	DailyMenuFetch,
	DayDetailsFetch,
	GetTrashItems,
	RemoveMenuItem,
	RestoreMenuItem,
	UpdateHeadcount,
	UpdateMenuItem,
	UpdateSubstitutions,
	UpsertDailyMenu,
} from "../schemas/planning.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { mutateOrFail, runQuery, toWire } from "../utils/index.ts"

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

	// "Cria se não existir, senão mantém" (idempotente). A unicidade do trio (data, refeição,
	// cozinha) é garantida por um índice PARCIAL (where deleted_at is null). Fazemos
	// select-then-insert ciente de soft-delete; o índice é a trava contra corrida.
	const existing = await runQuery("UPSERT_FAILED", () =>
		db.query.dailyMenuInKitchen.findFirst({
			where: and(
				eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
				eq(dailyMenuInKitchen.serviceDate, input.serviceDate),
				eq(dailyMenuInKitchen.mealTypeId, input.mealTypeId),
				isNull(dailyMenuInKitchen.deletedAt)
			),
		})
	)
	if (existing) return [toWire<DailyMenu>(existing)]

	const inserted = await mutateOrFail("UPSERT_FAILED", "no row returned", () =>
		db
			.insert(dailyMenuInKitchen)
			.values({
				kitchenId: input.kitchenId,
				serviceDate: input.serviceDate,
				mealTypeId: input.mealTypeId,
				status: "PLANNED",
				...(input.forecastedHeadcount != null && { forecastedHeadcount: input.forecastedHeadcount }),
			})
			.returning()
	)
	return inserted.map((row) => toWire<DailyMenu>(row))
}

/** Próxima posição livre no fim de um grupo dentro do cardápio do dia (itens ativos). */
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

	const itemGroup = input.itemGroup ?? null
	// Sem sortOrder explícito → posiciona no fim do grupo dentro do cardápio.
	const sortOrder = input.sortOrder ?? (await nextSortOrder(db, input.dailyMenuId, itemGroup))

	const inserted = await mutateOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(menuItemsInKitchen)
			.values({
				dailyMenuId: input.dailyMenuId,
				recipeOriginId: input.recipeId,
				recipe: recipeSnapshot,
				...(input.plannedPortionQuantity != null && { plannedPortionQuantity: String(input.plannedPortionQuantity) }),
				...(input.excludedFromProcurement != null && { excludedFromProcurement: String(input.excludedFromProcurement) }),
				itemGroup,
				sortOrder,
				recommendedProportion: input.recommendedProportion != null ? String(input.recommendedProportion) : null,
			})
			.returning()
	)
	return inserted.map((row) => toWire<MenuItem>(row))
}

export async function updateMenuItem(db: SisubDb, ctx: UserContext, input: UpdateMenuItem): Promise<MenuItem[]> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const updates: {
		plannedPortionQuantity?: string
		excludedFromProcurement?: string
		itemGroup?: string | null
		sortOrder?: number
		recommendedProportion?: string | null
	} = {}
	if (input.plannedPortionQuantity != null) updates.plannedPortionQuantity = String(input.plannedPortionQuantity)
	if (input.excludedFromProcurement != null) updates.excludedFromProcurement = String(input.excludedFromProcurement)
	if (input.recommendedProportion !== undefined)
		updates.recommendedProportion = input.recommendedProportion != null ? String(input.recommendedProportion) : null

	if (input.itemGroup !== undefined) {
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

	await runQuery("RESTORE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({ deletedAt: null })
			.where(eq(menuItemsInKitchen.id, input.menuItemId))
			.then(() => undefined)
	)
}

export async function updateHeadcount(db: SisubDb, ctx: UserContext, input: UpdateHeadcount): Promise<DailyMenu[]> {
	const kitchenId = await resolveKitchenFromMenu(db, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	const updated = await runQuery("UPDATE_FAILED", () =>
		db.update(dailyMenuInKitchen).set({ forecastedHeadcount: input.forecastedHeadcount }).where(eq(dailyMenuInKitchen.id, input.dailyMenuId)).returning()
	)
	return updated.map((row) => toWire<DailyMenu>(row))
}

export async function updateSubstitutions(db: SisubDb, ctx: UserContext, input: UpdateSubstitutions): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await runQuery("UPDATE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({ substitutions: input.substitutions })
			.where(eq(menuItemsInKitchen.id, input.menuItemId))
			.then(() => undefined)
	)
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
			.where(and(isNotNull(menuItemsInKitchen.deletedAt), eq(dailyMenuInKitchen.kitchenId, input.kitchenId)))
			.orderBy(desc(menuItemsInKitchen.deletedAt))
	)

	return rows.map((r) => ({
		...toWire<MenuItem>(r.item),
		recipe_origin: r.recipe_origin ? toWire<Recipe>(r.recipe_origin) : null,
		daily_menu: toWire<DailyMenu>(r.daily_menu),
	}))
}

// ─── Aggregated daily menu content (diner-facing) ───────────────────────────

type DishIngredient = { ingredient_name: string; quantity: number; measure_unit: string }
type DishDetails = { id: string; name: string; ingredients: DishIngredient[]; group: string | null; recommended_proportion: number | null }
type DayMenuContent = { [date: string]: { [mealKey: string]: DishDetails[] } }
type RecipeSnapshot = { name?: string; ingredients?: DishIngredient[] }

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
 * recipe_origin.name then "Prato sem nome"; ingredients come from the snapshot only.
 *
 * Auth posture preserved: authenticated entrypoint with no module-level guard.
 */
export async function fetchDailyMenuContent(db: SisubDb, _ctx: UserContext, input: FetchDailyMenuContent): Promise<DayMenuContent> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { serviceDate: true, kitchenId: true },
			with: {
				mealTypeInKitchen: { columns: { name: true } },
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
				if (snapshot.ingredients) ingredients = snapshot.ingredients
			} else if (item.recipesInKitchen?.name) {
				dishName = item.recipesInKitchen.name || dishName
			}

			const proportion = item.recommendedProportion == null ? null : Number(item.recommendedProportion)
			content[date][mealKey].push({ id: item.id, name: dishName, ingredients, group: item.itemGroup ?? null, recommended_proportion: proportion })
		}
	}

	return content
}
