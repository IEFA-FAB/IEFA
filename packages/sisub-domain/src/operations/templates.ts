/**
 * Template operations — Drizzle query layer (migração PostgREST→Drizzle).
 *
 * Contrato de retorno PRESERVADO (snake_case aninhado) via `toWire()`; o Drizzle
 * devolve colunas camelCase e relations com nomes gerados pelo `drizzle-kit pull`.
 *
 * Bug fix vs sisub:
 *   - applyTemplate: full rollback (restore previously deleted menus ON ERROR)
 *     was missing in sisub — only sisub-mcp had correct rollback. Aqui a
 *     materialização inteira roda numa transação Drizzle: qualquer falha parcial
 *     desfaz tudo (soft-delete dos menus existentes incluso).
 */

import { dailyMenuInSisub, menuItemsInSisub, menuTemplateInSisub, menuTemplateItemsInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { MealType, MenuTemplate, MenuTemplateItem, Recipe } from "@iefa/database/sisub"
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import { validateTemplateAccess } from "../guards/validate-scope.ts"
import type {
	ApplyTemplate,
	CreateBlankTemplate,
	CreateTemplate,
	DeleteTemplate,
	ForkTemplate,
	GetTemplate,
	ListTemplates,
	RestoreTemplate,
	TemplateItem,
	UpdateTemplate,
} from "../schemas/templates.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"

// ── Wire contract (snake_case aninhado, idêntico ao que o PostgREST devolvia) ──

type TemplateItemFull = MenuTemplateItem & { meal_type: MealType | null; recipe_origin: Recipe | null }
// Linha completa do template (o consumidor MenuTemplateWithItems espera todas as colunas, não um subset).
type TemplateWithItemsFull = MenuTemplate & { items: TemplateItemFull[] }
type TemplateWithCounts = MenuTemplate & {
	item_count: number
	recipe_count: number
	headcount_filled: number
	avg_headcount_weekday: number | null
}

/**
 * Relations da query relacional do Drizzle (nomes gerados pelo pull) → chaves do contrato.
 * Aplicado em todos os níveis por `toWire`.
 */
const TEMPLATE_RELATIONS: Record<string, string> = {
	menuTemplateItemsInSisubs: "items",
	mealTypeInSisub: "meal_type",
	recipesInSisub: "recipe_origin",
}

// Itens completos (com meal_type + recipe_origin aninhados) — para getTemplate/getTemplateItems.
const WITH_ITEMS_FULL = {
	menuTemplateItemsInSisubs: { with: { mealTypeInSisub: true, recipesInSisub: true } },
} as const

// ── List helpers ──

type CountRow = MenuTemplate & { items?: { headcountOverride: number | null; dayOfWeek: number | null }[] }

function mapTemplateWithCounts(t: CountRow): TemplateWithCounts {
	const items = t.items ?? []
	const item_count = items.length
	const headcount_filled = items.filter((i) => i.headcountOverride !== null).length
	const weekdayItems = items.filter((i) => i.dayOfWeek !== null && i.dayOfWeek >= 1 && i.dayOfWeek <= 4 && i.headcountOverride !== null)
	const avg_headcount_weekday =
		weekdayItems.length > 0 ? Math.round(weekdayItems.reduce((sum, i) => sum + (i.headcountOverride ?? 0), 0) / weekdayItems.length) : null
	const { items: _items, ...meta } = t
	return { ...toWire<MenuTemplate>(meta), item_count, recipe_count: item_count, headcount_filled, avg_headcount_weekday }
}

function templateScopeCondition(kitchenId: number | null | undefined) {
	if (kitchenId != null) return or(isNull(menuTemplateInSisub.kitchenId), eq(menuTemplateInSisub.kitchenId, kitchenId))
	return isNull(menuTemplateInSisub.kitchenId)
}

export async function listTemplates(db: SisubDb, ctx: UserContext, input: ListTemplates): Promise<TemplateWithCounts[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findMany({
			with: { menuTemplateItemsInSisubs: { columns: { headcountOverride: true, dayOfWeek: true } } },
			where: and(isNull(menuTemplateInSisub.deletedAt), templateScopeCondition(input.kitchenId)),
			orderBy: (t) => [asc(t.name)],
		})
	)
	return rows.map((r) => mapTemplateWithCounts(r as unknown as CountRow))
}

export async function listDeletedTemplates(db: SisubDb, ctx: UserContext, input: ListTemplates): Promise<TemplateWithCounts[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findMany({
			with: { menuTemplateItemsInSisubs: { columns: { headcountOverride: true, dayOfWeek: true } } },
			where: and(isNotNull(menuTemplateInSisub.deletedAt), templateScopeCondition(input.kitchenId)),
			orderBy: (t, { desc }) => [desc(t.deletedAt)],
		})
	)
	return rows.map((r) => mapTemplateWithCounts(r as unknown as CountRow))
}

export async function getTemplate(db: SisubDb, ctx: UserContext, input: GetTemplate): Promise<TemplateWithItemsFull> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findFirst({
			// Todas as colunas do template (contrato MenuTemplateWithItems = MenuTemplate completo).
			with: WITH_ITEMS_FULL,
			where: eq(menuTemplateInSisub.id, input.templateId),
		})
	)

	if (!row) throw new NotFoundError("menu_template", input.templateId)
	if (row.deletedAt !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${input.templateId} is deleted`)

	if (row.kitchenId !== null) {
		requireKitchen(ctx, 1, row.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const wire = toWire<TemplateWithItemsFull>(row, TEMPLATE_RELATIONS)
	const items = [...wire.items].sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0) || (a.meal_type_id ?? "").localeCompare(b.meal_type_id ?? ""))
	return { ...wire, items }
}

export async function getTemplateItems(db: SisubDb, ctx: UserContext, input: GetTemplate): Promise<TemplateItemFull[]> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findFirst({
			columns: { id: true, kitchenId: true, deletedAt: true },
			with: WITH_ITEMS_FULL,
			where: eq(menuTemplateInSisub.id, input.templateId),
		})
	)

	if (!row) throw new NotFoundError("menu_template", input.templateId)
	if (row.deletedAt !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${input.templateId} is deleted`)

	if (row.kitchenId !== null) {
		requireKitchen(ctx, 1, row.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const items = toWire<TemplateItemFull[]>(row.menuTemplateItemsInSisubs, TEMPLATE_RELATIONS)
	return items.sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0) || (a.meal_type_id ?? "").localeCompare(b.meal_type_id ?? ""))
}

function buildTemplateItemRows(templateId: string, items: TemplateItem[]): (typeof menuTemplateItemsInSisub.$inferInsert)[] {
	return items.map((item) => ({
		menuTemplateId: templateId,
		dayOfWeek: item.dayOfWeek,
		mealTypeId: item.mealTypeId,
		recipeId: item.recipeId,
		...(item.headcountOverride != null && { headcountOverride: item.headcountOverride }),
	}))
}

export async function createTemplate(db: SisubDb, ctx: UserContext, input: CreateTemplate): Promise<MenuTemplate> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const items = input.items ?? []

	const created = await db.transaction(async (tx) => {
		const [newTemplate] = await runQuery("INSERT_FAILED", () =>
			tx
				.insert(menuTemplateInSisub)
				.values({
					name: input.name,
					description: input.description ?? null,
					kitchenId: input.kitchenId ?? null,
					templateType: input.templateType,
				})
				.returning()
		)
		if (!newTemplate) throw new DomainError("INSERT_FAILED", "no row returned")

		if (items.length > 0) {
			await runQuery("INSERT_ITEMS_FAILED", () =>
				tx
					.insert(menuTemplateItemsInSisub)
					.values(buildTemplateItemRows(newTemplate.id, items))
					.then(() => undefined)
			)
		}
		return newTemplate
	})

	return toWire<MenuTemplate>(created)
}

export async function createBlankTemplate(db: SisubDb, ctx: UserContext, input: CreateBlankTemplate): Promise<MenuTemplate> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const [created] = await runQuery("INSERT_FAILED", () =>
		db
			.insert(menuTemplateInSisub)
			.values({
				name: input.name,
				description: input.description ?? null,
				kitchenId: input.kitchenId ?? null,
				templateType: input.templateType,
			})
			.returning()
	)
	if (!created) throw new DomainError("INSERT_FAILED", "no row returned")
	return toWire<MenuTemplate>(created)
}

export async function forkTemplate(db: SisubDb, ctx: UserContext, input: ForkTemplate): Promise<MenuTemplate> {
	// Fonte: template + itens juntos (uma query relacional).
	const source = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findFirst({
			columns: { id: true, kitchenId: true, name: true, deletedAt: true, templateType: true },
			with: { menuTemplateItemsInSisubs: { columns: { dayOfWeek: true, mealTypeId: true, recipeId: true } } },
			where: eq(menuTemplateInSisub.id, input.sourceTemplateId),
		})
	)

	if (!source) throw new NotFoundError("menu_template", input.sourceTemplateId)
	if (source.deletedAt !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${input.sourceTemplateId} is deleted`)

	if (source.kitchenId !== null) {
		requireKitchen(ctx, 1, source.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const targetKitchenId = input.targetKitchenId ?? null

	if (targetKitchenId !== null) {
		requireKitchen(ctx, 2, targetKitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const sourceItems = source.menuTemplateItemsInSisubs

	const created = await db.transaction(async (tx) => {
		const [newTemplate] = await runQuery("INSERT_FAILED", () =>
			tx
				.insert(menuTemplateInSisub)
				.values({
					name: input.newName ?? source.name,
					description: input.description ?? null,
					kitchenId: targetKitchenId,
					baseTemplateId: input.sourceTemplateId,
					templateType: source.templateType ?? "weekly",
				})
				.returning()
		)
		if (!newTemplate) throw new DomainError("INSERT_FAILED", "no row returned")

		if (sourceItems.length > 0) {
			const forkedItems = sourceItems.map((item) => ({
				menuTemplateId: newTemplate.id,
				dayOfWeek: item.dayOfWeek,
				mealTypeId: item.mealTypeId,
				recipeId: item.recipeId,
			}))
			await runQuery("INSERT_ITEMS_FAILED", () =>
				tx
					.insert(menuTemplateItemsInSisub)
					.values(forkedItems)
					.then(() => undefined)
			)
		}
		return newTemplate
	})

	return toWire<MenuTemplate>(created)
}

export async function updateTemplate(db: SisubDb, ctx: UserContext, input: UpdateTemplate): Promise<MenuTemplate> {
	const template = await validateTemplateAccess(db, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 2, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const updates: Partial<typeof menuTemplateInSisub.$inferInsert> = {}
	if (input.name != null) updates.name = input.name
	if (input.description != null) updates.description = input.description
	if (input.templateType != null) updates.templateType = input.templateType

	const result = await db.transaction(async (tx) => {
		const [updated] = await runQuery("UPDATE_FAILED", () =>
			tx.update(menuTemplateInSisub).set(updates).where(eq(menuTemplateInSisub.id, input.templateId)).returning()
		)
		if (!updated) throw new DomainError("UPDATE_FAILED", "no row returned")

		// Substituição destrutiva dos itens, se fornecidos (delete-all + re-insert na transação).
		const newItems = input.items
		if (newItems !== undefined) {
			await runQuery("DELETE_ITEMS_FAILED", () =>
				tx
					.delete(menuTemplateItemsInSisub)
					.where(eq(menuTemplateItemsInSisub.menuTemplateId, input.templateId))
					.then(() => undefined)
			)
			if (newItems.length > 0) {
				await runQuery("INSERT_ITEMS_FAILED", () =>
					tx
						.insert(menuTemplateItemsInSisub)
						.values(buildTemplateItemRows(input.templateId, newItems))
						.then(() => undefined)
				)
			}
		}
		return updated
	})

	return toWire<MenuTemplate>(result)
}

export async function deleteTemplate(db: SisubDb, ctx: UserContext, input: DeleteTemplate): Promise<void> {
	const template = await validateTemplateAccess(db, input.templateId, null)

	if (template.kitchen_id !== null) {
		requireKitchen(ctx, 2, template.kitchen_id)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	await runQuery("DELETE_FAILED", () =>
		db
			.update(menuTemplateInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(menuTemplateInSisub.id, input.templateId))
			.then(() => undefined)
	)
}

export async function restoreTemplate(db: SisubDb, ctx: UserContext, input: RestoreTemplate): Promise<void> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInSisub.findFirst({
			columns: { id: true, kitchenId: true, deletedAt: true },
			where: eq(menuTemplateInSisub.id, input.templateId),
		})
	)

	if (!row) throw new NotFoundError("menu_template", input.templateId)
	if (!row.deletedAt) throw new DomainError("NOT_DELETED", "Template is not deleted")

	if (row.kitchenId !== null) {
		requireKitchen(ctx, 2, row.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	await runQuery("RESTORE_FAILED", () =>
		db
			.update(menuTemplateInSisub)
			.set({ deletedAt: null })
			.where(eq(menuTemplateInSisub.id, input.templateId))
			.then(() => undefined)
	)
}

export async function applyTemplate(
	db: SisubDb,
	ctx: UserContext,
	input: ApplyTemplate
): Promise<{ menusCreated: number; itemsCreated: number; datesProcessed: string[] }> {
	requireKitchen(ctx, 2, input.kitchenId)

	// Valida template: não excluído, cozinha confere (lança se inacessível).
	await validateTemplateAccess(db, input.templateId, input.kitchenId)

	// Itens do template + receita de origem COM ingredientes — o snapshot json em menu_items
	// precisa do mesmo shape que addMenuItem grava (snake_case aninhado com `ingredients`),
	// senão o diner vê listas de ingredientes vazias e chaves camelCase.
	const templateItems = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateItemsInSisub.findMany({
			with: { recipesInSisub: { with: { recipeIngredientsInSisubs: { with: { ingredientInSisub: true } } } } },
			where: eq(menuTemplateItemsInSisub.menuTemplateId, input.templateId),
		})
	)

	// Intervalo de datas (YYYY-MM-DD).
	const targetDates: string[] = []
	const start = new Date(input.startDate)
	const end = new Date(input.endDate)
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		targetDates.push(d.toISOString().slice(0, 10))
	}

	// Constrói menus + itens novos.
	const newMenus: (typeof dailyMenuInSisub.$inferInsert)[] = []
	const newMenuItems: (typeof menuItemsInSisub.$inferInsert)[] = []

	for (const dateStr of targetDates) {
		const jsDay = new Date(dateStr).getDay()
		const dateDayOfWeek = jsDay === 0 ? 7 : jsDay
		const templateDay = ((dateDayOfWeek - input.startDayOfWeek + 7) % 7) + 1

		const itemsByMealType: Record<string, typeof templateItems> = {}
		for (const item of templateItems.filter((i) => i.dayOfWeek === templateDay)) {
			const key = item.mealTypeId ?? "__null__"
			if (!itemsByMealType[key]) itemsByMealType[key] = []
			itemsByMealType[key].push(item)
		}

		for (const [mealTypeId, items] of Object.entries(itemsByMealType)) {
			if (mealTypeId === "__null__") continue
			const menuId = crypto.randomUUID()
			newMenus.push({ id: menuId, serviceDate: dateStr, mealTypeId, kitchenId: input.kitchenId, status: "PLANNED" })
			for (const item of items) {
				// Snapshot snake_case com `ingredients` aninhado — idêntico ao addMenuItem.
				const recipeSnapshot = item.recipesInSisub
					? toWire<Record<string, unknown>>(item.recipesInSisub, { recipeIngredientsInSisubs: "ingredients", ingredientInSisub: "ingredient" })
					: {}
				newMenuItems.push({ dailyMenuId: menuId, recipeOriginId: item.recipeId ?? "", recipe: recipeSnapshot })
			}
		}
	}

	// Tudo numa transação: soft-delete dos menus existentes + insert dos novos.
	// Qualquer falha desfaz tudo (bug fix vs sisub: rollback completo).
	await db.transaction(async (tx) => {
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(dailyMenuInSisub)
				.set({ deletedAt: new Date().toISOString() })
				.where(and(inArray(dailyMenuInSisub.serviceDate, targetDates), eq(dailyMenuInSisub.kitchenId, input.kitchenId)))
				.then(() => undefined)
		)

		if (newMenus.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(dailyMenuInSisub)
					.values(newMenus)
					.then(() => undefined)
			)
		}

		if (newMenuItems.length > 0) {
			await runQuery("INSERT_ITEMS_FAILED", () =>
				tx
					.insert(menuItemsInSisub)
					.values(newMenuItems)
					.then(() => undefined)
			)
		}
	})

	return { menusCreated: newMenus.length, itemsCreated: newMenuItems.length, datesProcessed: targetDates }
}
