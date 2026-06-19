/**
 * Planning operations — Drizzle query layer (migração PostgREST→Drizzle).
 *
 * O contrato de retorno é PRESERVADO (snake_case aninhado) via `toWire()` — o Drizzle
 * devolve colunas em camelCase. Bugfixes vs sisub divergence preservados:
 *   - addMenuItem validates recipe kitchen_id (was missing in sisub)
 *   - fetchDailyMenus filters menu_items in DB query (not in memory) — agora no SQL via
 *     `where: isNull(...)` dentro do `with` aninhado.
 */

import { dailyMenuInSisub, menuItemsInSisub, recipesInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
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
import { runQuery, toWire } from "../utils/index.ts"

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
	mealTypeInSisub: "meal_type",
	menuItemsInSisubs: "menu_items",
	recipesInSisub: "recipe_origin",
}

// Relational `with` para daily_menu + meal_type + menu_items ativos (+ recipe_origin).
const WITH_MENU_ITEMS = {
	mealTypeInSisub: true,
	menuItemsInSisubs: {
		// Filtra soft-deleted no SQL (Drizzle permite where em relation aninhada — PostgREST não).
		where: isNull(menuItemsInSisub.deletedAt),
		with: { recipesInSisub: true },
	},
} as const

export async function fetchDailyMenus(db: SisubDb, ctx: UserContext, input: DailyMenuFetch): Promise<DailyMenuWithItems[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInSisub.findMany({
			where: and(
				eq(dailyMenuInSisub.kitchenId, input.kitchenId),
				gte(dailyMenuInSisub.serviceDate, input.startDate),
				lte(dailyMenuInSisub.serviceDate, input.endDate),
				isNull(dailyMenuInSisub.deletedAt)
			),
			with: WITH_MENU_ITEMS,
			orderBy: [asc(dailyMenuInSisub.serviceDate), asc(dailyMenuInSisub.mealTypeId)],
		})
	)

	return rows.map((row) => toWire<DailyMenuWithItems>(row, DAILY_MENU_RELATIONS))
}

export async function fetchDayDetails(db: SisubDb, ctx: UserContext, input: DayDetailsFetch): Promise<DailyMenuWithItems[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInSisub.findMany({
			where: and(eq(dailyMenuInSisub.kitchenId, input.kitchenId), eq(dailyMenuInSisub.serviceDate, input.date), isNull(dailyMenuInSisub.deletedAt)),
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
		db.query.dailyMenuInSisub.findFirst({
			where: and(
				eq(dailyMenuInSisub.kitchenId, input.kitchenId),
				eq(dailyMenuInSisub.serviceDate, input.serviceDate),
				eq(dailyMenuInSisub.mealTypeId, input.mealTypeId),
				isNull(dailyMenuInSisub.deletedAt)
			),
		})
	)
	if (existing) return [toWire<DailyMenu>(existing)]

	const inserted = await runQuery("UPSERT_FAILED", () =>
		db
			.insert(dailyMenuInSisub)
			.values({
				kitchenId: input.kitchenId,
				serviceDate: input.serviceDate,
				mealTypeId: input.mealTypeId,
				status: "PLANNED",
				...(input.forecastedHeadcount != null && { forecastedHeadcount: input.forecastedHeadcount }),
			})
			.returning()
	)
	if (inserted.length === 0) throw new DomainError("UPSERT_FAILED", "no row returned")
	return inserted.map((row) => toWire<DailyMenu>(row))
}

export async function addMenuItem(db: SisubDb, ctx: UserContext, input: AddMenuItem): Promise<MenuItem[]> {
	const kitchenId = await resolveKitchenFromMenu(db, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	// Fetch full recipe (includes kitchen_id) — replaces separate validateRecipeAccess call.
	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInSisub.findFirst({
			where: and(eq(recipesInSisub.id, input.recipeId), isNull(recipesInSisub.deletedAt)),
			with: { recipeIngredientsInSisubs: { with: { ingredientInSisub: true } } },
		})
	)
	if (!recipe) throw new DomainError("RECIPE_NOT_FOUND", `Recipe ${input.recipeId} not found`)

	if (recipe.kitchenId !== null && recipe.kitchenId !== kitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${input.recipeId} does not belong to kitchen ${kitchenId}`)
	}

	// Snapshot da receita gravado em JSON no contrato snake_case (idêntico ao PostgREST).
	const recipeSnapshot = toWire<Record<string, unknown>>(recipe, { recipeIngredientsInSisubs: "ingredients", ingredientInSisub: "ingredient" })

	const inserted = await runQuery("INSERT_FAILED", () =>
		db
			.insert(menuItemsInSisub)
			.values({
				dailyMenuId: input.dailyMenuId,
				recipeOriginId: input.recipeId,
				recipe: recipeSnapshot,
				...(input.plannedPortionQuantity != null && { plannedPortionQuantity: String(input.plannedPortionQuantity) }),
				...(input.excludedFromProcurement != null && { excludedFromProcurement: String(input.excludedFromProcurement) }),
			})
			.returning()
	)
	if (inserted.length === 0) throw new DomainError("INSERT_FAILED", "no row returned")
	return inserted.map((row) => toWire<MenuItem>(row))
}

export async function updateMenuItem(db: SisubDb, ctx: UserContext, input: UpdateMenuItem): Promise<MenuItem[]> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const updates: { plannedPortionQuantity?: string; excludedFromProcurement?: string } = {}
	if (input.plannedPortionQuantity != null) updates.plannedPortionQuantity = String(input.plannedPortionQuantity)
	if (input.excludedFromProcurement != null) updates.excludedFromProcurement = String(input.excludedFromProcurement)

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const updated = await runQuery("UPDATE_FAILED", () => db.update(menuItemsInSisub).set(updates).where(eq(menuItemsInSisub.id, input.menuItemId)).returning())
	return updated.map((row) => toWire<MenuItem>(row))
}

export async function removeMenuItem(db: SisubDb, ctx: UserContext, input: RemoveMenuItem): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await runQuery("DELETE_FAILED", () =>
		db
			.update(menuItemsInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(menuItemsInSisub.id, input.menuItemId))
			.then(() => undefined)
	)
}

export async function restoreMenuItem(db: SisubDb, ctx: UserContext, input: RestoreMenuItem): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await runQuery("RESTORE_FAILED", () =>
		db
			.update(menuItemsInSisub)
			.set({ deletedAt: null })
			.where(eq(menuItemsInSisub.id, input.menuItemId))
			.then(() => undefined)
	)
}

export async function updateHeadcount(db: SisubDb, ctx: UserContext, input: UpdateHeadcount): Promise<DailyMenu[]> {
	const kitchenId = await resolveKitchenFromMenu(db, input.dailyMenuId)
	requireKitchen(ctx, 2, kitchenId)

	const updated = await runQuery("UPDATE_FAILED", () =>
		db.update(dailyMenuInSisub).set({ forecastedHeadcount: input.forecastedHeadcount }).where(eq(dailyMenuInSisub.id, input.dailyMenuId)).returning()
	)
	return updated.map((row) => toWire<DailyMenu>(row))
}

export async function updateSubstitutions(db: SisubDb, ctx: UserContext, input: UpdateSubstitutions): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	await runQuery("UPDATE_FAILED", () =>
		db
			.update(menuItemsInSisub)
			.set({ substitutions: input.substitutions })
			.where(eq(menuItemsInSisub.id, input.menuItemId))
			.then(() => undefined)
	)
}

export async function getTrashItems(db: SisubDb, ctx: UserContext, input: GetTrashItems): Promise<TrashMenuItem[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	// daily_menu!inner + filtro por kitchen_id no SQL (join), não em JS — não varre o lixo de
	// outras cozinhas. Itens órfãos (daily_menu hard-deletado) ficam de fora pelo inner join.
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ item: menuItemsInSisub, recipe_origin: recipesInSisub, daily_menu: dailyMenuInSisub })
			.from(menuItemsInSisub)
			.innerJoin(dailyMenuInSisub, eq(menuItemsInSisub.dailyMenuId, dailyMenuInSisub.id))
			.leftJoin(recipesInSisub, eq(menuItemsInSisub.recipeOriginId, recipesInSisub.id))
			.where(and(isNotNull(menuItemsInSisub.deletedAt), eq(dailyMenuInSisub.kitchenId, input.kitchenId)))
			.orderBy(desc(menuItemsInSisub.deletedAt))
	)

	return rows.map((r) => ({
		...toWire<MenuItem>(r.item),
		recipe_origin: r.recipe_origin ? toWire<Recipe>(r.recipe_origin) : null,
		daily_menu: toWire<DailyMenu>(r.daily_menu),
	}))
}

// ─── Aggregated daily menu content (diner-facing) ───────────────────────────

type DishIngredient = { ingredient_name: string; quantity: number; measure_unit: string }
type DishDetails = { id: string; name: string; ingredients: DishIngredient[] }
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
		db.query.dailyMenuInSisub.findMany({
			columns: { serviceDate: true, kitchenId: true },
			with: {
				mealTypeInSisub: { columns: { name: true } },
				menuItemsInSisubs: {
					// Não devolver itens soft-deleted ao diner (paridade com as demais queries do arquivo).
					where: isNull(menuItemsInSisub.deletedAt),
					columns: { id: true, recipe: true },
					with: { recipesInSisub: { columns: { name: true } } },
				},
			},
			where: and(
				inArray(dailyMenuInSisub.kitchenId, input.kitchenIds),
				gte(dailyMenuInSisub.serviceDate, input.startDate),
				lte(dailyMenuInSisub.serviceDate, input.endDate),
				// Não vazar daily_menu soft-deleted (ex.: apagado por applyTemplate) ao diner.
				isNull(dailyMenuInSisub.deletedAt)
			),
		})
	)

	const content: DayMenuContent = {}

	for (const menu of rows) {
		const date = menu.serviceDate
		if (!date) continue

		const mealName = menu.mealTypeInSisub?.name
		if (!mealName) continue

		const mealKey = mapMealTypeNameToKey(mealName)
		if (!mealKey) continue

		if (!content[date]) content[date] = {}
		if (!content[date][mealKey]) content[date][mealKey] = []

		for (const item of menu.menuItemsInSisubs ?? []) {
			let dishName = "Prato sem nome"
			let ingredients: DishIngredient[] = []

			if (item.recipe) {
				const snapshot = item.recipe as RecipeSnapshot
				dishName = snapshot?.name || dishName
				if (snapshot.ingredients) ingredients = snapshot.ingredients
			} else if (item.recipesInSisub?.name) {
				dishName = item.recipesInSisub.name || dishName
			}

			content[date][mealKey].push({ id: item.id, name: dishName, ingredients })
		}
	}

	return content
}
