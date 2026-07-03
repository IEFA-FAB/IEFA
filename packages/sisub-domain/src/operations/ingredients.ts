/**
 * Ingredient operations: folders, ingredients, ingredient_items, nutrients, CEAFA, CATMAT.
 * Drizzle query layer (migração PostgREST→Drizzle).
 *
 * Contrato de retorno PRESERVADO em snake_case via `toWire()` — o Drizzle devolve camelCase.
 * Soft-delete inline (`deletedAt`); filtro de soft-deleted em SQL com `isNull`.
 * Nenhuma coluna camelCase no DB nestas tabelas → `toWire`/`toColumns` são seguros.
 */

import type { Tables as ComprasGovTables } from "@iefa/database/compras-gov"
import {
	ceafaInKitchen,
	comprasMaterialItemInComprasGovIntegration,
	folderInKitchen,
	ingredientInKitchen,
	ingredientItemInKitchen,
	ingredientNutritionReferenceInKitchen,
	ingredientNutrientInKitchen,
	nutritionFoodItemInNutritionReference,
	nutritionFoodItemRevisionInNutritionReference,
	nutritionFoodNutrientValueInNutritionReference,
	nutritionNutrientComponentInNutritionReference,
	nutritionNutrientComponentMappingInNutritionReference,
	nutritionSourceInNutritionReference,
	nutritionSourceReleaseInNutritionReference,
	nutrientInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { requireAnyPermission } from "../guards/require-permission.ts"
import type {
	CreateFolder,
	CreateIngredient,
	CreateIngredientItem,
	DeleteFolder,
	DeleteIngredient,
	DeleteIngredientItem,
	FetchIngredient,
	FetchIngredientEffectiveNutrients,
	FetchIngredientNutrients,
	ListCatmat,
	ListCeafa,
	ListFolders,
	ListIngredientItems,
	ListIngredients,
	ListNutritionReferenceFoods,
	RestoreFolder,
	RestoreIngredient,
	SetIngredientNutritionReference,
	SetIngredientNutrients,
	UpdateFolder,
	UpdateIngredient,
	UpdateIngredientItem,
} from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"

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
type CatmatItem = Pick<ComprasGovTables<"compras_material_item">, "codigo_item" | "descricao_item" | "item_sustentavel">

export type NutritionReferenceSummary = {
	ingredient_id?: string
	food_revision_id: string
	food_item_id: string
	source_id: string
	source_name: string
	external_code: string
	display_name: string
	group_name: string | null
	version_label: string
	citation: string | null
	base_quantity: number
	base_unit: string
	linked_at?: string
	match_status?: "manual" | "suggested" | "reviewed"
}

export type NutritionReferenceFoodSearchItem = NutritionReferenceSummary & {
	license_name: string | null
}

export type EffectiveIngredientNutrient = IngredientNutrientWire & {
	source: "manual" | "reference"
	value_kind?: string | null
	raw_value?: string | null
}

export type IngredientEffectiveNutrientsResult = {
	reference: NutritionReferenceSummary | null
	nutrients: EffectiveIngredientNutrient[]
}

const ITEM_PURCHASE_RELATIONS: Record<string, string> = { purchaseItemInProcurement: "purchase_item" }
const NUTRIENT_RELATIONS: Record<string, string> = { nutrientInKitchen: "nutrient" }
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

function isMissingNutritionReferenceRelation(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return /relation .*ingredient_nutrition_reference.* does not exist|relation .*nutrition_reference\..* does not exist|schema "nutrition_reference" does not exist/i.test(
		message
	)
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function listFolders(db: SisubDb, ctx: UserContext, input?: ListFolders): Promise<Folder[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const where = input?.includeDeleted ? undefined : isNull(folderInKitchen.deletedAt)
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(folderInKitchen).where(where).orderBy(asc(folderInKitchen.createdAt)))
	return rows.map((r) => toWire<Folder>(r))
}

export async function createFolder(db: SisubDb, ctx: UserContext, input: CreateFolder): Promise<Folder> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db.insert(folderInKitchen).values({ description: input.description, parentId: input.parentId }).returning()
	)
	return toWire<Folder>(row)
}

export async function updateFolder(db: SisubDb, ctx: UserContext, input: UpdateFolder): Promise<Folder> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("UPDATE_FAILED", `folder ${input.id} not found`, () =>
		db.update(folderInKitchen).set({ description: input.description, parentId: input.parentId }).where(eq(folderInKitchen.id, input.id)).returning()
	)
	return toWire<Folder>(row)
}

export async function deleteFolder(db: SisubDb, ctx: UserContext, input: DeleteFolder): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	await mutateOrFail("DELETE_FAILED", `folder ${input.id} not found`, () =>
		db.update(folderInKitchen).set({ deletedAt: new Date().toISOString() }).where(eq(folderInKitchen.id, input.id)).returning({ id: folderInKitchen.id })
	)
}

export async function restoreFolder(db: SisubDb, ctx: UserContext, input: RestoreFolder): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	await mutateOrFail("RESTORE_FAILED", `folder ${input.id} not found`, () =>
		db.update(folderInKitchen).set({ deletedAt: null }).where(eq(folderInKitchen.id, input.id)).returning({ id: folderInKitchen.id })
	)
}

// ─── Ingredients ────────────────────────────────────────────────────────────

export async function listIngredients(db: SisubDb, ctx: UserContext, input: ListIngredients): Promise<Ingredient[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const conditions = []
	if (!input.includeDeleted) conditions.push(isNull(ingredientInKitchen.deletedAt))
	if (input.folderId) conditions.push(eq(ingredientInKitchen.folderId, input.folderId))
	const where = conditions.length > 0 ? and(...conditions) : undefined
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(ingredientInKitchen).where(where).orderBy(asc(ingredientInKitchen.description)))
	return rows.map((r) => toWire<Ingredient>(r))
}

export async function fetchIngredient(db: SisubDb, ctx: UserContext, input: FetchIngredient): Promise<Ingredient> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientInKitchen.findFirst({ where: and(eq(ingredientInKitchen.id, input.id), isNull(ingredientInKitchen.deletedAt)) })
	)
	if (!row) throw new NotFoundError("ingredient", input.id)
	return toWire<Ingredient>(row)
}

export async function createIngredient(db: SisubDb, ctx: UserContext, input: CreateIngredient): Promise<Ingredient> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(ingredientInKitchen)
			.values({
				description: input.description,
				folderId: input.folderId,
				measureUnit: input.measureUnit,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				ceafaId: input.ceafaId,
			})
			.returning()
	)
	return toWire<Ingredient>(row)
}

export async function updateIngredient(db: SisubDb, ctx: UserContext, input: UpdateIngredient): Promise<Ingredient> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("UPDATE_FAILED", `ingredient ${input.id} not found`, () =>
		db
			.update(ingredientInKitchen)
			.set({
				description: input.description,
				folderId: input.folderId,
				measureUnit: input.measureUnit,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				ceafaId: input.ceafaId,
			})
			.where(eq(ingredientInKitchen.id, input.id))
			.returning()
	)
	return toWire<Ingredient>(row)
}

export async function deleteIngredient(db: SisubDb, ctx: UserContext, input: DeleteIngredient): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	await mutateOrFail("DELETE_FAILED", `ingredient ${input.id} not found`, () =>
		db
			.update(ingredientInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(ingredientInKitchen.id, input.id))
			.returning({ id: ingredientInKitchen.id })
	)
}

export async function restoreIngredient(db: SisubDb, ctx: UserContext, input: RestoreIngredient): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	await mutateOrFail("RESTORE_FAILED", `ingredient ${input.id} not found`, () =>
		db.update(ingredientInKitchen).set({ deletedAt: null }).where(eq(ingredientInKitchen.id, input.id)).returning({ id: ingredientInKitchen.id })
	)
}

// ─── Ingredient items (itens de produto) ─────────────────────────────────────

export async function listIngredientItems(db: SisubDb, ctx: UserContext, input: ListIngredientItems): Promise<IngredientItemWire[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	// Traz o purchase_item vinculado (item de compra) para o item de produto herdar o CATMAT.
	const conditions = [isNull(ingredientItemInKitchen.deletedAt)]
	if (input.ingredientId) conditions.push(eq(ingredientItemInKitchen.ingredientId, input.ingredientId))
	const rows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientItemInKitchen.findMany({
			with: { purchaseItemInProcurement: PURCHASE_ITEM_COLS },
			where: and(...conditions),
			orderBy: (i, { asc }) => [asc(i.description)],
		})
	)
	return rows.map((r) => toWire<IngredientItemWire>(r, ITEM_PURCHASE_RELATIONS))
}

export async function createIngredientItem(db: SisubDb, ctx: UserContext, input: CreateIngredientItem): Promise<IngredientItem> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(ingredientItemInKitchen)
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
	return toWire<IngredientItem>(row)
}

export async function updateIngredientItem(db: SisubDb, ctx: UserContext, input: UpdateIngredientItem): Promise<IngredientItem> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const row = await insertOneOrFail("UPDATE_FAILED", `ingredient_item ${input.id} not found`, () =>
		db
			.update(ingredientItemInKitchen)
			.set({
				ingredientId: input.ingredientId,
				description: input.description,
				barcode: input.barcode,
				purchaseMeasureUnit: input.purchaseMeasureUnit,
				unitContentQuantity: input.unitContentQuantity != null ? String(input.unitContentQuantity) : null,
				correctionFactor: input.correctionFactor != null ? String(input.correctionFactor) : null,
				purchaseItemId: input.purchaseItemId,
			})
			.where(eq(ingredientItemInKitchen.id, input.id))
			.returning()
	)
	return toWire<IngredientItem>(row)
}

export async function deleteIngredientItem(db: SisubDb, ctx: UserContext, input: DeleteIngredientItem): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	await mutateOrFail("DELETE_FAILED", `ingredient_item ${input.id} not found`, () =>
		db
			.update(ingredientItemInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(ingredientItemInKitchen.id, input.id))
			.returning({ id: ingredientItemInKitchen.id })
	)
}

// ─── Nutrients ────────────────────────────────────────────────────────────────

export async function listNutrients(db: SisubDb, ctx: UserContext): Promise<Nutrient[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const rows = await runQuery("QUERY_FAILED", () =>
		db.select().from(nutrientInKitchen).where(isNull(nutrientInKitchen.deletedAt)).orderBy(asc(nutrientInKitchen.displayOrder))
	)
	return rows.map((r) => toWire<Nutrient>(r))
}

export async function listIngredientNutrients(db: SisubDb, ctx: UserContext, input: FetchIngredientNutrients): Promise<IngredientNutrientWire[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const rows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientNutrientInKitchen.findMany({
			with: { nutrientInKitchen: true },
			where: and(eq(ingredientNutrientInKitchen.ingredientId, input.ingredientId), isNull(ingredientNutrientInKitchen.deletedAt)),
		})
	)
	return rows.map((r) => toWire<IngredientNutrientWire>(r, NUTRIENT_RELATIONS))
}

async function fetchIngredientNutritionReference(db: SisubDb, ingredientId: string): Promise<NutritionReferenceSummary | null> {
	const rows = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({
					ingredient_id: ingredientNutritionReferenceInKitchen.ingredientId,
					food_revision_id: nutritionFoodItemRevisionInNutritionReference.id,
					food_item_id: nutritionFoodItemInNutritionReference.id,
					source_id: nutritionSourceInNutritionReference.id,
					source_name: nutritionSourceInNutritionReference.displayName,
					external_code: nutritionFoodItemInNutritionReference.externalCode,
					display_name: nutritionFoodItemRevisionInNutritionReference.displayName,
					group_name: nutritionFoodItemRevisionInNutritionReference.groupName,
					version_label: nutritionSourceReleaseInNutritionReference.versionLabel,
					citation: nutritionSourceInNutritionReference.citation,
					base_quantity: nutritionFoodItemRevisionInNutritionReference.baseQuantity,
					base_unit: nutritionFoodItemRevisionInNutritionReference.baseUnit,
					linked_at: ingredientNutritionReferenceInKitchen.linkedAt,
					match_status: ingredientNutritionReferenceInKitchen.matchStatus,
				})
				.from(ingredientNutritionReferenceInKitchen)
				.innerJoin(
					nutritionFoodItemRevisionInNutritionReference,
					eq(ingredientNutritionReferenceInKitchen.foodRevisionId, nutritionFoodItemRevisionInNutritionReference.id)
				)
				.innerJoin(
					nutritionFoodItemInNutritionReference,
					eq(nutritionFoodItemRevisionInNutritionReference.foodItemId, nutritionFoodItemInNutritionReference.id)
				)
				.innerJoin(nutritionSourceInNutritionReference, eq(nutritionFoodItemInNutritionReference.sourceId, nutritionSourceInNutritionReference.id))
				.innerJoin(
					nutritionSourceReleaseInNutritionReference,
					eq(nutritionFoodItemRevisionInNutritionReference.sourceReleaseId, nutritionSourceReleaseInNutritionReference.id)
				)
				.where(eq(ingredientNutritionReferenceInKitchen.ingredientId, ingredientId))
				.limit(1),
		{ includeCode: true, prefix: "Falha ao buscar vínculo nutricional" }
	).catch((error) => {
		if (isMissingNutritionReferenceRelation(error)) return []
		throw error
	})
	const row = rows[0]
	if (!row) return null
	return {
		...row,
		base_quantity: Number(row.base_quantity),
		match_status: row.match_status as "manual" | "suggested" | "reviewed",
	}
}

export async function getIngredientNutritionReference(
	db: SisubDb,
	ctx: UserContext,
	input: FetchIngredientNutrients
): Promise<NutritionReferenceSummary | null> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	return fetchIngredientNutritionReference(db, input.ingredientId)
}

export async function listNutritionReferenceFoods(
	db: SisubDb,
	ctx: UserContext,
	input: ListNutritionReferenceFoods
): Promise<NutritionReferenceFoodSearchItem[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const term = input.search.trim()
	if (term.length < 2) return []

	const escaped = `%${term.replace(/[\\%_]/g, "\\$&")}%`
	const conditions = [
		eq(nutritionFoodItemRevisionInNutritionReference.isCurrent, true),
		or(
			ilike(nutritionFoodItemRevisionInNutritionReference.displayName, escaped),
			ilike(nutritionFoodItemRevisionInNutritionReference.normalizedName, escaped),
			ilike(nutritionFoodItemInNutritionReference.externalCode, escaped),
			ilike(nutritionFoodItemRevisionInNutritionReference.groupName, escaped)
		),
	]
	if (input.sourceId) conditions.push(eq(nutritionSourceInNutritionReference.id, input.sourceId))

	const rows = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({
					food_revision_id: nutritionFoodItemRevisionInNutritionReference.id,
					food_item_id: nutritionFoodItemInNutritionReference.id,
					source_id: nutritionSourceInNutritionReference.id,
					source_name: nutritionSourceInNutritionReference.displayName,
					external_code: nutritionFoodItemInNutritionReference.externalCode,
					display_name: nutritionFoodItemRevisionInNutritionReference.displayName,
					group_name: nutritionFoodItemRevisionInNutritionReference.groupName,
					version_label: nutritionSourceReleaseInNutritionReference.versionLabel,
					citation: nutritionSourceInNutritionReference.citation,
					base_quantity: nutritionFoodItemRevisionInNutritionReference.baseQuantity,
					base_unit: nutritionFoodItemRevisionInNutritionReference.baseUnit,
					license_name: nutritionSourceInNutritionReference.licenseName,
				})
				.from(nutritionFoodItemRevisionInNutritionReference)
				.innerJoin(
					nutritionFoodItemInNutritionReference,
					eq(nutritionFoodItemRevisionInNutritionReference.foodItemId, nutritionFoodItemInNutritionReference.id)
				)
				.innerJoin(nutritionSourceInNutritionReference, eq(nutritionFoodItemInNutritionReference.sourceId, nutritionSourceInNutritionReference.id))
				.innerJoin(
					nutritionSourceReleaseInNutritionReference,
					eq(nutritionFoodItemRevisionInNutritionReference.sourceReleaseId, nutritionSourceReleaseInNutritionReference.id)
				)
				.where(and(...conditions))
				.orderBy(asc(nutritionSourceInNutritionReference.sourcePriority), asc(nutritionFoodItemRevisionInNutritionReference.displayName))
				.limit(40),
		{ includeCode: true, prefix: "Falha ao buscar tabela alimentar" }
	).catch((error) => {
		if (isMissingNutritionReferenceRelation(error)) return []
		throw error
	})

	return rows.map((row) => ({ ...row, base_quantity: Number(row.base_quantity) }))
}

export async function setIngredientNutritionReference(db: SisubDb, ctx: UserContext, input: SetIngredientNutritionReference): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	if (input.foodRevisionId == null) {
		await runQuery(
			"UPDATE_FAILED",
			() => db.delete(ingredientNutritionReferenceInKitchen).where(eq(ingredientNutritionReferenceInKitchen.ingredientId, input.ingredientId)),
			{ includeCode: true, prefix: "Falha ao remover vínculo nutricional" }
		).catch((error) => {
			if (isMissingNutritionReferenceRelation(error)) return
			throw error
		})
		return
	}

	const revision = await runQuery("QUERY_FAILED", () =>
		db
			.select({ id: nutritionFoodItemRevisionInNutritionReference.id })
			.from(nutritionFoodItemRevisionInNutritionReference)
			.where(eq(nutritionFoodItemRevisionInNutritionReference.id, input.foodRevisionId as string))
			.limit(1)
	)
	if (revision.length === 0) throw new NotFoundError("nutrition_reference_food_revision", input.foodRevisionId)

	await runQuery("UPDATE_FAILED", () =>
		db
			.insert(ingredientNutritionReferenceInKitchen)
			.values({
				ingredientId: input.ingredientId,
				foodRevisionId: input.foodRevisionId as string,
				matchStatus: input.matchStatus ?? "manual",
				linkedBy: ctx.userId ?? null,
				notes: input.notes ?? null,
			})
			.onConflictDoUpdate({
				target: ingredientNutritionReferenceInKitchen.ingredientId,
				set: {
					foodRevisionId: input.foodRevisionId as string,
					matchStatus: input.matchStatus ?? "manual",
					linkedBy: ctx.userId ?? null,
					notes: input.notes ?? null,
					linkedAt: new Date().toISOString(),
				},
			})
	)
}

export async function listIngredientEffectiveNutrients(
	db: SisubDb,
	ctx: UserContext,
	input: FetchIngredientEffectiveNutrients
): Promise<IngredientEffectiveNutrientsResult> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const reference = await fetchIngredientNutritionReference(db, input.ingredientId)
	if (!reference) {
		const nutrients = await listIngredientNutrients(db, ctx, input)
		return { reference: null, nutrients: nutrients.map((n) => ({ ...n, source: "manual" as const })) }
	}

	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				id: nutritionFoodNutrientValueInNutritionReference.id,
				ingredient_id: ingredientNutritionReferenceInKitchen.ingredientId,
				created_at: nutritionFoodNutrientValueInNutritionReference.createdAt,
				nutrient_id: nutrientInKitchen.id,
				nutrient_value: sql<
					number | null
				>`(${nutritionFoodNutrientValueInNutritionReference.value} * ${nutritionNutrientComponentMappingInNutritionReference.conversionMultiplier}) + ${nutritionNutrientComponentMappingInNutritionReference.conversionOffset}`,
				deleted_at: sql<null>`null`,
				value_kind: nutritionFoodNutrientValueInNutritionReference.valueKind,
				raw_value: nutritionFoodNutrientValueInNutritionReference.rawValue,
				nutrient: {
					id: nutrientInKitchen.id,
					created_at: nutrientInKitchen.createdAt,
					name: nutrientInKitchen.name,
					daily_value: nutrientInKitchen.dailyValue,
					minimum_value: nutrientInKitchen.minimumValue,
					is_energy_value: nutrientInKitchen.isEnergyValue,
					enum_name: nutrientInKitchen.enumName,
					display_order: nutrientInKitchen.displayOrder,
					deleted_at: nutrientInKitchen.deletedAt,
					legacy_id: nutrientInKitchen.legacyId,
				},
			})
			.from(ingredientNutritionReferenceInKitchen)
			.innerJoin(
				nutritionFoodNutrientValueInNutritionReference,
				eq(ingredientNutritionReferenceInKitchen.foodRevisionId, nutritionFoodNutrientValueInNutritionReference.foodRevisionId)
			)
			.innerJoin(
				nutritionNutrientComponentMappingInNutritionReference,
				eq(nutritionFoodNutrientValueInNutritionReference.componentId, nutritionNutrientComponentMappingInNutritionReference.componentId)
			)
			.innerJoin(nutrientInKitchen, eq(nutritionNutrientComponentMappingInNutritionReference.nutrientId, nutrientInKitchen.id))
			.innerJoin(
				nutritionNutrientComponentInNutritionReference,
				eq(nutritionFoodNutrientValueInNutritionReference.componentId, nutritionNutrientComponentInNutritionReference.id)
			)
			.where(
				and(
					eq(ingredientNutritionReferenceInKitchen.ingredientId, input.ingredientId),
					eq(nutritionNutrientComponentMappingInNutritionReference.isPreferred, true),
					isNull(nutrientInKitchen.deletedAt)
				)
			)
			.orderBy(asc(nutrientInKitchen.displayOrder), asc(nutrientInKitchen.name))
	)

	return {
		reference,
		nutrients: rows
			.filter((row) => row.nutrient_value != null)
			.map((row) => ({
				...row,
				nutrient_value: row.nutrient_value != null ? Number(row.nutrient_value) : null,
				nutrient: {
					...row.nutrient,
					daily_value: row.nutrient.daily_value != null ? Number(row.nutrient.daily_value) : null,
					minimum_value: row.nutrient.minimum_value != null ? Number(row.nutrient.minimum_value) : null,
				},
				source: "reference" as const,
			})),
	}
}

/** Cliente de transação Drizzle (o `tx` passado ao callback de `db.transaction`). */
type SisubTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

/**
 * Substituição total dos nutrientes de um insumo, DENTRO de uma transação: soft-delete dos ativos
 * + upsert do novo conjunto. Compartilhado por `setIngredientNutrients` e a restauração de versão.
 *
 * Upsert (não insert): o índice único product_nutrient_unique (ingredient_id, nutrient_id) NÃO
 * considera deleted_at, então uma linha soft-deletada ainda ocupa o slot. Reinserir o mesmo par
 * violaria o unique — por isso atualizamos a linha existente no conflito, restaurando deleted_at = null.
 */
export async function replaceIngredientNutrients(
	tx: SisubTx,
	ingredientId: string,
	nutrients: Array<{ nutrientId: string; nutrientValue: number | null }>
): Promise<void> {
	await tx
		.update(ingredientNutrientInKitchen)
		.set({ deletedAt: new Date().toISOString() })
		.where(and(eq(ingredientNutrientInKitchen.ingredientId, ingredientId), isNull(ingredientNutrientInKitchen.deletedAt)))

	const toUpsert = nutrients
		.filter((n) => n.nutrientValue != null && !Number.isNaN(n.nutrientValue))
		.map((n) => ({ ingredientId, nutrientId: n.nutrientId, nutrientValue: String(n.nutrientValue), deletedAt: null }))

	if (toUpsert.length > 0) {
		await tx
			.insert(ingredientNutrientInKitchen)
			.values(toUpsert)
			.onConflictDoUpdate({
				target: [ingredientNutrientInKitchen.ingredientId, ingredientNutrientInKitchen.nutrientId],
				set: { nutrientValue: sql`excluded.nutrient_value`, deletedAt: null },
			})
	}
}

export async function setIngredientNutrients(db: SisubDb, ctx: UserContext, input: SetIngredientNutrients): Promise<void> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const reference = await fetchIngredientNutritionReference(db, input.ingredientId)
	if (reference) {
		throw new DomainError("NUTRITION_REFERENCE_LOCKED", "Nutrientes manuais bloqueados: remova a vinculação com tabela alimentar para editar.")
	}
	await runQuery("UPDATE_FAILED", () => db.transaction((tx) => replaceIngredientNutrients(tx, input.ingredientId, input.nutrients)))
}

// ─── CEAFA + CATMAT lookups ──────────────────────────────────────────────────

export async function listCeafa(db: SisubDb, ctx: UserContext, input: ListCeafa): Promise<Ceafa[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const search = input.search?.trim()
	const where = search ? ilike(ceafaInKitchen.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`) : undefined
	const rows = await runQuery("QUERY_FAILED", () => db.select().from(ceafaInKitchen).where(where).orderBy(asc(ceafaInKitchen.description)).limit(50))
	return rows.map((r) => toWire<Ceafa>(r))
}

export async function listCatmatItems(db: SisubDb, ctx: UserContext, input: ListCatmat): Promise<CatmatItem[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const term = input.search.trim()
	if (term.length < 2) return []

	const isNumericCode = /^\d+$/.test(term)
	const where = isNumericCode
		? and(eq(comprasMaterialItemInComprasGovIntegration.statusItem, true), eq(comprasMaterialItemInComprasGovIntegration.codigoItem, Number.parseInt(term, 10)))
		: and(
				eq(comprasMaterialItemInComprasGovIntegration.statusItem, true),
				ilike(comprasMaterialItemInComprasGovIntegration.descricaoItem, `%${term.replace(/[\\%_]/g, "\\$&")}%`)
			)

	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				codigo_item: comprasMaterialItemInComprasGovIntegration.codigoItem,
				descricao_item: comprasMaterialItemInComprasGovIntegration.descricaoItem,
				item_sustentavel: comprasMaterialItemInComprasGovIntegration.itemSustentavel,
			})
			.from(comprasMaterialItemInComprasGovIntegration)
			.where(where)
			.orderBy(asc(comprasMaterialItemInComprasGovIntegration.descricaoItem))
			.limit(40)
	)
	return rows
}
