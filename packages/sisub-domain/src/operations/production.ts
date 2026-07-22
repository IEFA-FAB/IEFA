/**
 * Kitchen production-board operations: production_task lifecycle. Drizzle query layer.
 *
 * Postura de auth: todas as operations exigem o módulo kitchen-production escopado
 * pela cozinha (o gate deixou de viver só na rota). Nível 1 cobre o ciclo do board
 * (ler, criar tasks, check-in de status, registro do real) — é a interação-grão do
 * terminal do chão de fábrica; ações que remodelam o planejamento (porções,
 * substituições) exigem nível 2 em kitchen-production OU kitchen.
 *
 * State machine: PENDING -> IN_PROGRESS (sets started_at) -> DONE (sets
 * completed_at) -> PENDING (clears both timestamps).
 */

import { dailyMenuInKitchen, menuItemsInKitchen, productionTaskInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireAnyPermission, requireKitchenProduction } from "../guards/require-permission.ts"
import { resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import type {
	AdjustProductionPortions,
	EnsureProductionTasks,
	FetchProductionBoard,
	RecordProductionSubstitution,
	UpdateProductionTaskRecord,
	UpdateProductionTaskStatus,
} from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery, toWire } from "../utils/index.ts"

const RECIPE_RELATIONS: Record<string, string> = { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }

type ProductionTask = Tables<"production_task">
type BoardItem = {
	task: ProductionTask
	menuItem: {
		id: string
		recipe_origin_id: string | null
		planned_portion_quantity: string | null
		substitutions: Record<string, unknown> | null
		recipe_origin: Record<string, unknown> | null
		recipe_with_ingredients: Record<string, unknown> | null
	}
	mealType: Record<string, unknown> | null
}

/**
 * Returns production items for a kitchen on a date. Only items that already have
 * a production_task are returned — call ensureProductionTasks first to create them.
 */
export async function fetchProductionBoard(db: SisubDb, ctx: UserContext, input: FetchProductionBoard): Promise<BoardItem[]> {
	requireKitchenProduction(ctx, 1, input.kitchenId)

	// DUAS queries de propósito: aninhar recipes → recipe_ingredients → ingredient aqui
	// (5 níveis a partir de daily_menu) estoura o limite de 63 chars de alias do
	// Postgres — os níveis profundos colidem no identificador truncado → 42703.
	// As receitas (3 níveis, dentro do limite) são buscadas à parte e juntadas em JS.
	const dailyMenus = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { id: true, mealTypeId: true, forecastedHeadcount: true },
			with: {
				mealTypeInKitchen: { columns: { id: true, name: true, sortOrder: true } },
				menuItemsInKitchens: {
					// Filtra soft-deleted no SQL (Drizzle permite where em relation aninhada — PostgREST não).
					where: isNull(menuItemsInKitchen.deletedAt),
					columns: { id: true, recipeOriginId: true, plannedPortionQuantity: true, substitutions: true },
					with: {
						productionTaskInKitchens: {
							columns: {
								id: true,
								status: true,
								startedAt: true,
								completedAt: true,
								notes: true,
								producedQuantity: true,
								leftoverQuantity: true,
								updatedAt: true,
								createdAt: true,
								kitchenId: true,
								menuItemId: true,
								productionDate: true,
							},
						},
					},
				},
			},
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
		})
	)

	const recipeIds = [
		...new Set(dailyMenus.flatMap((menu) => (menu.menuItemsInKitchens ?? []).map((item) => item.recipeOriginId).filter((id): id is string => id != null))),
	]
	const recipes =
		recipeIds.length > 0
			? await runQuery("FETCH_FAILED", () =>
					db.query.recipesInKitchen.findMany({
						columns: { id: true, name: true, portionYield: true, preparationMethod: true, preparationTimeMinutes: true, kitchenId: true },
						with: {
							recipeIngredientsInKitchens: {
								columns: { id: true, netQuantity: true, priorityOrder: true, isOptional: true },
								with: { ingredientInKitchen: { columns: { id: true, description: true, measureUnit: true } } },
							},
						},
						where: inArray(recipesInKitchen.id, recipeIds),
					})
				)
			: []
	const recipeById = new Map(recipes.map((r) => [r.id, r]))

	const items: BoardItem[] = []
	for (const menu of dailyMenus) {
		const mealType = menu.mealTypeInKitchen ? toWire<Record<string, unknown>>(menu.mealTypeInKitchen) : null

		for (const menuItem of menu.menuItemsInKitchens ?? []) {
			// Soft-deleted já filtrados no SQL (where acima).
			// Skip items without a task yet — created later by ensureProductionTasks.
			const taskRaw = menuItem.productionTaskInKitchens[0]
			if (!taskRaw) continue

			const recipeRaw = menuItem.recipeOriginId != null ? recipeById.get(menuItem.recipeOriginId) : undefined
			const recipeOrigin = recipeRaw ? toWire<Record<string, unknown>>(recipeRaw, RECIPE_RELATIONS) : null

			items.push({
				task: toWire<ProductionTask>(taskRaw),
				menuItem: {
					id: menuItem.id,
					recipe_origin_id: menuItem.recipeOriginId,
					planned_portion_quantity: menuItem.plannedPortionQuantity,
					substitutions: (menuItem.substitutions as Record<string, unknown> | null) ?? null,
					recipe_origin: recipeOrigin,
					recipe_with_ingredients: recipeOrigin ? { ...recipeOrigin, ingredients: recipeOrigin.ingredients ?? [] } : null,
				},
				mealType,
			})
		}
	}

	return items
}

/**
 * Creates PENDING production_task records for all menu_items on a date that lack
 * one. Idempotent (onConflictDoNothing on UNIQUE menu_item_id). `created` é a
 * contagem REAL inserida (via RETURNING) — 0 numa 2ª chamada idempotente.
 */
export async function ensureProductionTasks(db: SisubDb, ctx: UserContext, input: EnsureProductionTasks): Promise<{ created: number }> {
	requireKitchenProduction(ctx, 1, input.kitchenId)

	const dailyMenus = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { id: true },
			with: { menuItemsInKitchens: { where: isNull(menuItemsInKitchen.deletedAt), columns: { id: true } } },
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
		})
	)

	const menuItemIds = dailyMenus.flatMap((menu) => (menu.menuItemsInKitchens ?? []).map((item) => item.id))
	if (menuItemIds.length === 0) return { created: 0 }

	const tasksToInsert = menuItemIds.map((menuItemId) => ({
		kitchenId: input.kitchenId,
		menuItemId,
		productionDate: input.date,
		status: "PENDING" as const,
	}))

	const inserted = await runQuery("INSERT_FAILED", () =>
		db
			.insert(productionTaskInKitchen)
			.values(tasksToInsert)
			.onConflictDoNothing({ target: productionTaskInKitchen.menuItemId })
			.returning({ id: productionTaskInKitchen.id })
	)

	return { created: inserted.length }
}

/** Transitions a production_task to a new status, managing timestamps. */
export async function updateProductionTaskStatus(db: SisubDb, ctx: UserContext, input: UpdateProductionTaskStatus): Promise<ProductionTask> {
	const kitchenId = await resolveKitchenFromTask(db, input.taskId)
	requireKitchenProduction(ctx, 1, kitchenId)

	const now = new Date().toISOString()

	const updates: { status: string; updatedAt: string; startedAt?: string | null; completedAt?: string | null } = { status: input.status, updatedAt: now }
	if (input.status === "IN_PROGRESS") {
		updates.startedAt = now
		updates.completedAt = null
	} else if (input.status === "DONE") {
		updates.completedAt = now
	} else if (input.status === "PENDING") {
		updates.startedAt = null
		updates.completedAt = null
	}

	const row = await insertOneOrFail("UPDATE_FAILED", `production_task ${input.taskId} not found`, () =>
		db.update(productionTaskInKitchen).set(updates).where(eq(productionTaskInKitchen.id, input.taskId)).returning()
	)
	return toWire<ProductionTask>(row)
}

/** Resolve a cozinha dona da task (para o guard escopado). */
async function resolveKitchenFromTask(db: SisubDb, taskId: string): Promise<number> {
	const task = await runQuery("FETCH_FAILED", () =>
		db.query.productionTaskInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(productionTaskInKitchen.id, taskId) })
	)
	if (!task) throw new NotFoundError("production_task", taskId)
	return task.kitchenId
}

/**
 * Registra o REAL da produção: porções produzidas, sobras e observações.
 * Gate nível 1 do módulo kitchen-production (mesmo acesso do board): o check-in
 * do turno é a interação-grão do painel, não uma edição de planejamento.
 */
export async function updateProductionTaskRecord(db: SisubDb, ctx: UserContext, input: UpdateProductionTaskRecord): Promise<ProductionTask> {
	const kitchenId = await resolveKitchenFromTask(db, input.taskId)
	requireKitchenProduction(ctx, 1, kitchenId)

	const updates: { updatedAt: string; producedQuantity?: string | null; leftoverQuantity?: string | null; notes?: string | null } = {
		updatedAt: new Date().toISOString(),
	}
	if (input.producedQuantity !== undefined) updates.producedQuantity = input.producedQuantity != null ? String(input.producedQuantity) : null
	if (input.leftoverQuantity !== undefined) updates.leftoverQuantity = input.leftoverQuantity != null ? String(input.leftoverQuantity) : null
	if (input.notes !== undefined) updates.notes = input.notes

	const row = await insertOneOrFail("UPDATE_FAILED", `production_task ${input.taskId} not found`, () =>
		db.update(productionTaskInKitchen).set(updates).where(eq(productionTaskInKitchen.id, input.taskId)).returning()
	)
	return toWire<ProductionTask>(row)
}

/**
 * Ajusta as porções planejadas de um item direto do painel de produção (corte de
 * efetivo, evento surpresa). Edição de dado de planejamento → exige nível 2 em
 * kitchen-production OU kitchen (o nutricionista também ajusta por aqui).
 */
export async function adjustProductionPortions(db: SisubDb, ctx: UserContext, input: AdjustProductionPortions): Promise<{ id: string }> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireAnyPermission(ctx, ["kitchen-production", "kitchen"], 2, { type: "kitchen", id: kitchenId })

	const row = await insertOneOrFail("UPDATE_FAILED", `menu_item ${input.menuItemId} not found`, () =>
		db
			.update(menuItemsInKitchen)
			.set({ plannedPortionQuantity: String(input.plannedPortionQuantity) })
			.where(eq(menuItemsInKitchen.id, input.menuItemId))
			.returning({ id: menuItemsInKitchen.id })
	)
	return row
}

/**
 * Registra uma substituição de insumo feita durante o turno. Merge no JSON
 * `substitutions` do menu_item (mesmo contrato do SubstitutionModal do
 * planejamento), com type "production" para distinguir a origem chão de fábrica.
 */
export async function recordProductionSubstitution(db: SisubDb, ctx: UserContext, input: RecordProductionSubstitution): Promise<void> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireAnyPermission(ctx, ["kitchen-production", "kitchen"], 2, { type: "kitchen", id: kitchenId })

	const entry = { [input.ingredientId]: { type: "production", rationale: input.rationale, updated_at: new Date().toISOString() } }

	// Merge atômico no SQL (jsonb ||): dois operadores registrando substituições
	// diferentes ao mesmo tempo não se sobrescrevem — read-merge-write em JS perderia
	// a escrita mais antiga.
	const updated = await runQuery("UPDATE_FAILED", () =>
		db
			.update(menuItemsInKitchen)
			.set({
				substitutions: sql`(coalesce(${menuItemsInKitchen.substitutions}::jsonb, '{}'::jsonb) || ${JSON.stringify(entry)}::jsonb)::json`,
			})
			.where(eq(menuItemsInKitchen.id, input.menuItemId))
			.returning({ id: menuItemsInKitchen.id })
	)
	if (updated.length === 0) throw new NotFoundError("menu_item", input.menuItemId)
}
