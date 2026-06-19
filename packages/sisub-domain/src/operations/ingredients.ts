/**
 * Ingredient operations: folders, ingredients, ingredient_items, nutrients, CEAFA, CATMAT.
 * Drizzle query layer (migração PostgREST→Drizzle).
 *
 * Contrato de retorno PRESERVADO em snake_case via `toWire()` — o Drizzle devolve camelCase.
 * Soft-delete inline (`deletedAt`); filtro de soft-deleted em SQL com `isNull`.
 * Nenhuma coluna camelCase no DB nestas tabelas → `toWire`/`toColumns` são seguros.
 */

import {
	ceafaInSisub,
	comprasMaterialItemInSisub,
	folderInSisub,
	ingredientInSisub,
	ingredientItemInSisub,
	ingredientNutrientInSisub,
	nutrientInSisub,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type {
	CreateFolder,
	CreateIngredient,
	CreateIngredientItem,
	DeleteFolder,
	DeleteIngredient,
	DeleteIngredientItem,
	FetchIngredient,
	FetchIngredientNutrients,
	ListCatmat,
	ListCeafa,
	ListFolders,
	ListIngredientItems,
	ListIngredients,
	RestoreFolder,
	RestoreIngredient,
	SetIngredientNutrients,
	UpdateFolder,
	UpdateIngredient,
	UpdateIngredientItem,
} from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"

type Folder = Tables<"folder">
type Ingredient = Tables<"ingredient">
type IngredientItem = Tables<"ingredient_item">
type Nutrient = Tables<"nutrient">
type IngredientNutrient = Tables<"ingredient_nutrient">
type Ceafa = Tables<"ceafa">

// Projeção achatada do purchase_item vinculado (item de compra herda o CATMAT).
type PurchaseItemRef = Pick<
	Tables<"purchase_item">,
	"id" | "description" | "catmat_item_codigo" | "catmat_item_descricao" | "purchase_measure_unit" | "unit_price"
>
type IngredientItemWire = IngredientItem & { purchase_item: PurchaseItemRef | null }
type NutrientRef = Nutrient
type IngredientNutrientWire = IngredientNutrient & { nutrient: NutrientRef | null }
type CatmatItem = Pick<Tables<"compras_material_item">, "codigo_item" | "descricao_item" | "item_sustentavel">

const ITEM_PURCHASE_RELATIONS: Record<string, string> = { purchaseItemInSisub: "purchase_item" }
const NUTRIENT_RELATIONS: Record<string, string> = { nutrientInSisub: "nutrient" }
const PURCHASE_ITEM_COLS = {
	columns: {
		id: true,
		description: true,
		catmatItemCodigo: true,
		catmatItemDescricao: true,
		purchaseMeasureUnit: true,
		unitPrice: true,
	},
} as const

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function listFolders(db: SisubDb, ctx: UserContext, input?: ListFolders): Promise<Folder[]> {
	requirePermission(ctx, "kitchen", 1)
	const where = input?.includeDeleted ? undefined : isNull(folderInSisub.deletedAt)
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(folderInSisub).where(where).orderBy(asc(folderInSisub.createdAt)))
	return rows.map((r) => toWire<Folder>(r))
}

export async function createFolder(db: SisubDb, ctx: UserContext, input: CreateFolder): Promise<Folder> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("INSERT_FAILED", () => db.insert(folderInSisub).values({ description: input.description, parentId: input.parentId }).returning())
	if (!row) throw new DomainError("INSERT_FAILED", "no row returned")
	return toWire<Folder>(row)
}

export async function updateFolder(db: SisubDb, ctx: UserContext, input: UpdateFolder): Promise<Folder> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("UPDATE_FAILED", () =>
		db.update(folderInSisub).set({ description: input.description, parentId: input.parentId }).where(eq(folderInSisub.id, input.id)).returning()
	)
	if (!row) throw new DomainError("UPDATE_FAILED", `folder ${input.id} not found`)
	return toWire<Folder>(row)
}

export async function deleteFolder(db: SisubDb, ctx: UserContext, input: DeleteFolder): Promise<void> {
	requirePermission(ctx, "kitchen", 1)
	const deleted = await runQuery("DELETE_FAILED", () =>
		db.update(folderInSisub).set({ deletedAt: new Date().toISOString() }).where(eq(folderInSisub.id, input.id)).returning({ id: folderInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `folder ${input.id} not found`)
}

export async function restoreFolder(db: SisubDb, ctx: UserContext, input: RestoreFolder): Promise<void> {
	requirePermission(ctx, "kitchen", 1)
	const restored = await runQuery("RESTORE_FAILED", () =>
		db.update(folderInSisub).set({ deletedAt: null }).where(eq(folderInSisub.id, input.id)).returning({ id: folderInSisub.id })
	)
	if (restored.length === 0) throw new DomainError("RESTORE_FAILED", `folder ${input.id} not found`)
}

// ─── Ingredients ────────────────────────────────────────────────────────────

export async function listIngredients(db: SisubDb, ctx: UserContext, input: ListIngredients): Promise<Ingredient[]> {
	requirePermission(ctx, "kitchen", 1)
	const conditions = []
	if (!input.includeDeleted) conditions.push(isNull(ingredientInSisub.deletedAt))
	if (input.folderId) conditions.push(eq(ingredientInSisub.folderId, input.folderId))
	const where = conditions.length > 0 ? and(...conditions) : undefined
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(ingredientInSisub).where(where).orderBy(asc(ingredientInSisub.description)))
	return rows.map((r) => toWire<Ingredient>(r))
}

export async function fetchIngredient(db: SisubDb, ctx: UserContext, input: FetchIngredient): Promise<Ingredient> {
	requirePermission(ctx, "kitchen", 1)
	const row = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientInSisub.findFirst({ where: and(eq(ingredientInSisub.id, input.id), isNull(ingredientInSisub.deletedAt)) })
	)
	if (!row) throw new NotFoundError("ingredient", input.id)
	return toWire<Ingredient>(row)
}

export async function createIngredient(db: SisubDb, ctx: UserContext, input: CreateIngredient): Promise<Ingredient> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("INSERT_FAILED", () =>
		db
			.insert(ingredientInSisub)
			.values({
				description: input.description,
				folderId: input.folderId,
				measureUnit: input.measureUnit,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				ceafaId: input.ceafaId,
			})
			.returning()
	)
	if (!row) throw new DomainError("INSERT_FAILED", "no row returned")
	return toWire<Ingredient>(row)
}

export async function updateIngredient(db: SisubDb, ctx: UserContext, input: UpdateIngredient): Promise<Ingredient> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("UPDATE_FAILED", () =>
		db
			.update(ingredientInSisub)
			.set({
				description: input.description,
				folderId: input.folderId,
				measureUnit: input.measureUnit,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				ceafaId: input.ceafaId,
			})
			.where(eq(ingredientInSisub.id, input.id))
			.returning()
	)
	if (!row) throw new DomainError("UPDATE_FAILED", `ingredient ${input.id} not found`)
	return toWire<Ingredient>(row)
}

export async function deleteIngredient(db: SisubDb, ctx: UserContext, input: DeleteIngredient): Promise<void> {
	requirePermission(ctx, "kitchen", 1)
	const deleted = await runQuery("DELETE_FAILED", () =>
		db.update(ingredientInSisub).set({ deletedAt: new Date().toISOString() }).where(eq(ingredientInSisub.id, input.id)).returning({ id: ingredientInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `ingredient ${input.id} not found`)
}

export async function restoreIngredient(db: SisubDb, ctx: UserContext, input: RestoreIngredient): Promise<void> {
	requirePermission(ctx, "kitchen", 1)
	const restored = await runQuery("RESTORE_FAILED", () =>
		db.update(ingredientInSisub).set({ deletedAt: null }).where(eq(ingredientInSisub.id, input.id)).returning({ id: ingredientInSisub.id })
	)
	if (restored.length === 0) throw new DomainError("RESTORE_FAILED", `ingredient ${input.id} not found`)
}

// ─── Ingredient items (itens de produto) ─────────────────────────────────────

export async function listIngredientItems(db: SisubDb, ctx: UserContext, input: ListIngredientItems): Promise<IngredientItemWire[]> {
	requirePermission(ctx, "kitchen", 1)
	// Traz o purchase_item vinculado (item de compra) para o item de produto herdar o CATMAT.
	const conditions = [isNull(ingredientItemInSisub.deletedAt)]
	if (input.ingredientId) conditions.push(eq(ingredientItemInSisub.ingredientId, input.ingredientId))
	const rows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientItemInSisub.findMany({
			with: { purchaseItemInSisub: PURCHASE_ITEM_COLS },
			where: and(...conditions),
			orderBy: (i, { asc }) => [asc(i.description)],
		})
	)
	return rows.map((r) => toWire<IngredientItemWire>(r, ITEM_PURCHASE_RELATIONS))
}

export async function createIngredientItem(db: SisubDb, ctx: UserContext, input: CreateIngredientItem): Promise<IngredientItem> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("INSERT_FAILED", () =>
		db
			.insert(ingredientItemInSisub)
			.values({
				ingredientId: input.ingredientId,
				description: input.description,
				barcode: input.barcode,
				purchaseMeasureUnit: input.purchaseMeasureUnit,
				unitContentQuantity: input.unitContentQuantity != null ? String(input.unitContentQuantity) : null,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				purchaseItemId: input.purchaseItemId,
			})
			.returning()
	)
	if (!row) throw new DomainError("INSERT_FAILED", "no row returned")
	return toWire<IngredientItem>(row)
}

export async function updateIngredientItem(db: SisubDb, ctx: UserContext, input: UpdateIngredientItem): Promise<IngredientItem> {
	requirePermission(ctx, "kitchen", 1)
	const [row] = await runQuery("UPDATE_FAILED", () =>
		db
			.update(ingredientItemInSisub)
			.set({
				ingredientId: input.ingredientId,
				description: input.description,
				barcode: input.barcode,
				purchaseMeasureUnit: input.purchaseMeasureUnit,
				unitContentQuantity: input.unitContentQuantity != null ? String(input.unitContentQuantity) : null,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				purchaseItemId: input.purchaseItemId,
			})
			.where(eq(ingredientItemInSisub.id, input.id))
			.returning()
	)
	if (!row) throw new DomainError("UPDATE_FAILED", `ingredient_item ${input.id} not found`)
	return toWire<IngredientItem>(row)
}

export async function deleteIngredientItem(db: SisubDb, ctx: UserContext, input: DeleteIngredientItem): Promise<void> {
	requirePermission(ctx, "kitchen", 1)
	const deleted = await runQuery("DELETE_FAILED", () =>
		db
			.update(ingredientItemInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(ingredientItemInSisub.id, input.id))
			.returning({ id: ingredientItemInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `ingredient_item ${input.id} not found`)
}

// ─── Nutrients ────────────────────────────────────────────────────────────────

export async function listNutrients(db: SisubDb, ctx: UserContext): Promise<Nutrient[]> {
	requirePermission(ctx, "kitchen", 1)
	const rows = await runQuery("QUERY_FAILED", () =>
		db.select().from(nutrientInSisub).where(isNull(nutrientInSisub.deletedAt)).orderBy(asc(nutrientInSisub.displayOrder))
	)
	return rows.map((r) => toWire<Nutrient>(r))
}

export async function listIngredientNutrients(db: SisubDb, ctx: UserContext, input: FetchIngredientNutrients): Promise<IngredientNutrientWire[]> {
	requirePermission(ctx, "kitchen", 1)
	const rows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientNutrientInSisub.findMany({
			with: { nutrientInSisub: true },
			where: and(eq(ingredientNutrientInSisub.ingredientId, input.ingredientId), isNull(ingredientNutrientInSisub.deletedAt)),
		})
	)
	return rows.map((r) => toWire<IngredientNutrientWire>(r, NUTRIENT_RELATIONS))
}

export async function setIngredientNutrients(db: SisubDb, ctx: UserContext, input: SetIngredientNutrients): Promise<void> {
	requirePermission(ctx, "kitchen", 1)

	const toUpsert = input.nutrients
		.filter((n) => n.nutrientValue != null)
		.map((n) => ({ ingredientId: input.ingredientId, nutrientId: n.nutrientId, nutrientValue: String(n.nutrientValue), deletedAt: null }))

	await runQuery("UPDATE_FAILED", () =>
		db.transaction(async (tx) => {
			// Soft-delete os nutrientes atuais. O upsert abaixo revive (deleted_at = null) os que voltam.
			await tx
				.update(ingredientNutrientInSisub)
				.set({ deletedAt: new Date().toISOString() })
				.where(and(eq(ingredientNutrientInSisub.ingredientId, input.ingredientId), isNull(ingredientNutrientInSisub.deletedAt)))

			// Upsert (não insert): o índice único product_nutrient_unique (ingredient_id, nutrient_id) NÃO
			// considera deleted_at, então uma linha soft-deletada ainda ocupa o slot. Reinserir o mesmo par
			// violaria o unique — por isso atualizamos a linha existente no conflito, restaurando deleted_at = null.
			if (toUpsert.length > 0) {
				await tx
					.insert(ingredientNutrientInSisub)
					.values(toUpsert)
					.onConflictDoUpdate({
						target: [ingredientNutrientInSisub.ingredientId, ingredientNutrientInSisub.nutrientId],
						set: { nutrientValue: sql`excluded.nutrient_value`, deletedAt: null },
					})
			}
		})
	)
}

// ─── CEAFA + CATMAT lookups ──────────────────────────────────────────────────

export async function listCeafa(db: SisubDb, ctx: UserContext, input: ListCeafa): Promise<Ceafa[]> {
	requirePermission(ctx, "kitchen", 1)
	const search = input.search?.trim()
	const where = search ? ilike(ceafaInSisub.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`) : undefined
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(ceafaInSisub).where(where).orderBy(asc(ceafaInSisub.description)).limit(50))
	return rows.map((r) => toWire<Ceafa>(r))
}

export async function listCatmatItems(db: SisubDb, ctx: UserContext, input: ListCatmat): Promise<CatmatItem[]> {
	requirePermission(ctx, "kitchen", 1)
	const term = input.search.trim()
	if (term.length < 2) return []

	const isNumericCode = /^\d+$/.test(term)
	const where = isNumericCode
		? and(eq(comprasMaterialItemInSisub.statusItem, true), eq(comprasMaterialItemInSisub.codigoItem, Number.parseInt(term, 10)))
		: and(eq(comprasMaterialItemInSisub.statusItem, true), ilike(comprasMaterialItemInSisub.descricaoItem, `%${term.replace(/[\\%_]/g, "\\$&")}%`))

	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				codigo_item: comprasMaterialItemInSisub.codigoItem,
				descricao_item: comprasMaterialItemInSisub.descricaoItem,
				item_sustentavel: comprasMaterialItemInSisub.itemSustentavel,
			})
			.from(comprasMaterialItemInSisub)
			.where(where)
			.orderBy(asc(comprasMaterialItemInSisub.descricaoItem))
			.limit(40)
	)
	return rows
}
