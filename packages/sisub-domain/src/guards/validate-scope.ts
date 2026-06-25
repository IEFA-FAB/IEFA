/**
 * Scope-validation guards (Drizzle query layer): resolve/validate kitchen ownership
 * of recipes, menu templates, daily menus and menu items before a scoped mutation.
 */

import { dailyMenuInKitchen, menuItemsInKitchen, menuTemplateInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { eq } from "drizzle-orm"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

type TemplateRow = { id: string; kitchen_id: number | null; name: string | null; deleted_at: string | null }

export async function validateRecipeAccess(db: SisubDb, recipeId: string, targetKitchenId: number): Promise<void> {
	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(recipesInKitchen.id, recipeId) })
	)
	if (!recipe) throw new NotFoundError("recipe", recipeId)
	if (recipe.kitchenId !== null && recipe.kitchenId !== targetKitchenId) {
		throw new DomainError("RECIPE_ACCESS_DENIED", `Recipe ${recipeId} does not belong to kitchen ${targetKitchenId}`)
	}
}

export async function validateTemplateAccess(db: SisubDb, templateId: string, kitchenId: number | null): Promise<TemplateRow> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: menuTemplateInKitchen.id,
				kitchen_id: menuTemplateInKitchen.kitchenId,
				name: menuTemplateInKitchen.name,
				deleted_at: menuTemplateInKitchen.deletedAt,
			})
			.from(menuTemplateInKitchen)
			.where(eq(menuTemplateInKitchen.id, templateId))
			.limit(1)
	)
	const template = rows[0]
	if (!template) throw new NotFoundError("menu_template", templateId)
	if (template.deleted_at !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${templateId} is deleted`)
	if (template.kitchen_id !== null && kitchenId !== null && template.kitchen_id !== kitchenId) {
		throw new DomainError("TEMPLATE_ACCESS_DENIED", `Template ${templateId} does not belong to kitchen ${kitchenId}`)
	}
	return template
}

export async function resolveKitchenFromMenu(db: SisubDb, dailyMenuId: string): Promise<number> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(dailyMenuInKitchen.id, dailyMenuId) })
	)
	if (!row || row.kitchenId == null) throw new NotFoundError("daily_menu", dailyMenuId)
	return row.kitchenId
}

export async function resolveKitchenFromMenuItem(db: SisubDb, menuItemId: string): Promise<number> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuItemsInKitchen.findFirst({
			columns: { id: true },
			with: { dailyMenuInKitchen: { columns: { kitchenId: true } } },
			where: eq(menuItemsInKitchen.id, menuItemId),
		})
	)
	const kitchenId = row?.dailyMenuInKitchen?.kitchenId
	if (kitchenId == null) throw new NotFoundError("menu_item", menuItemId)
	return kitchenId
}

export async function resolveKitchenFromTemplate(db: SisubDb, templateId: string): Promise<number | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(menuTemplateInKitchen.id, templateId) })
	)
	if (!row) throw new NotFoundError("menu_template", templateId)
	return row.kitchenId
}
