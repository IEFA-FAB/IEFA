/**
 * Ingredient versioning operations: snapshot do agregado, dedup, registro e restauração de versões.
 * Drizzle query layer (migração PostgREST→Drizzle).
 *
 * `IngredientSnapshot`/`IngredientVersionRow` permanecem o contrato (snake_case) — o snapshot
 * jsonb deve espelhar o backfill SQL em 20260609_ingredient_versioning.sql. A restauração é
 * multi-statement → roda em `db.transaction`.
 */

import {
	ingredientInKitchen,
	ingredientItemInKitchen,
	ingredientNutrientInKitchen,
	ingredientNutritionReferenceInKitchen,
	ingredientVersionInKitchen,
	nutrientInKitchen,
	nutritionFoodItemInNutritionReference,
	nutritionFoodItemRevisionInNutritionReference,
	nutritionFoodNutrientValueInNutritionReference,
	nutritionNutrientComponentMappingInNutritionReference,
	nutritionSourceInNutritionReference,
	nutritionSourceReleaseInNutritionReference,
	purchaseItemIngredientInProcurement,
	purchaseItemInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListIngredientVersions, RecordIngredientVersion, RestoreIngredientVersion, VersionActor } from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"
import { replaceIngredientNutrients } from "./ingredients.ts"

// ── Shape do snapshot (deve espelhar o backfill SQL em 20260609_ingredient_versioning.sql) ──

export interface IngredientSnapshot {
	ingredient: {
		description: string | null
		folder_id: string | null
		folder_description: string | null
		measure_unit: string | null
		correction_factor: number | null
		ceafa_id: string | null
		ceafa_description: string | null
	}
	nutrition_reference?: {
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
		match_status: string | null
		linked_at: string | null
	} | null
	nutrients: { nutrient_id: string; name: string | null; value: number }[]
	product_items: {
		id: string
		description: string | null
		barcode: string | null
		purchase_measure_unit: string | null
		unit_content_quantity: number | null
		correction_factor: number | null
		purchase_item_id: string | null
	}[]
	purchase_links: {
		link_id: string
		purchase_item_id: string
		description: string | null
		catmat_item_codigo: number | null
		catmat_item_descricao: string | null
		purchase_measure_unit: string | null
		unit_price: number | null
		conversion_factor: number | null
		is_default: boolean
	}[]
}

export interface IngredientVersionRow {
	id: string
	ingredient_id: string
	version_number: number
	snapshot: IngredientSnapshot
	change_summary: string | null
	changed_by: string | null
	changed_by_name: string | null
	created_at: string
}

/** Stringify estável (chaves ordenadas recursivamente) para comparar snapshots
 *  independente da ordem de chaves do jsonb retornado pelo Postgres. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
	const obj = value as Record<string, unknown>
	const keys = Object.keys(obj).sort()
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

function isMissingNutritionReferenceRelation(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return /relation .*ingredient_nutrition_reference.* does not exist|relation .*nutrition_reference\..* does not exist|schema "nutrition_reference" does not exist/i.test(
		message
	)
}

/** Lê o agregado completo do insumo (perspectiva da tela de edição) → snapshot. */
export async function buildIngredientSnapshot(db: SisubDb, ingredientId: string): Promise<IngredientSnapshot> {
	const ing = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientInKitchen.findFirst({
			columns: { description: true, folderId: true, measureUnit: true, correctionFactor: true, ceafaId: true },
			with: {
				folderInKitchen: { columns: { description: true } },
				ceafaInKitchen: { columns: { description: true } },
			},
			where: eq(ingredientInKitchen.id, ingredientId),
		})
	)
	if (!ing) throw new NotFoundError("ingredient", ingredientId)

	const folder = ing.folderInKitchen
	const ceafa = ing.ceafaInKitchen

	const referenceRows = await runQuery(
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
					match_status: ingredientNutritionReferenceInKitchen.matchStatus,
					linked_at: ingredientNutritionReferenceInKitchen.linkedAt,
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
		{ includeCode: true, prefix: "Falha ao buscar vínculo nutricional do snapshot" }
	).catch((error) => {
		if (isMissingNutritionReferenceRelation(error)) return []
		throw error
	})
	const nutrition_reference = referenceRows[0]
		? {
				...referenceRows[0],
				base_quantity: Number(referenceRows[0].base_quantity),
			}
		: null

	const nutrients = nutrition_reference
		? (
				await runQuery("QUERY_FAILED", () =>
					db
						.select({
							nutrient_id: nutrientInKitchen.id,
							name: nutrientInKitchen.name,
							value: sql<
								number | null
							>`(${nutritionFoodNutrientValueInNutritionReference.value} * ${nutritionNutrientComponentMappingInNutritionReference.conversionMultiplier}) + ${nutritionNutrientComponentMappingInNutritionReference.conversionOffset}`,
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
						.where(
							and(
								eq(ingredientNutritionReferenceInKitchen.ingredientId, ingredientId),
								eq(nutritionNutrientComponentMappingInNutritionReference.isPreferred, true),
								isNull(nutrientInKitchen.deletedAt)
							)
						)
						.orderBy(asc(nutrientInKitchen.displayOrder), asc(nutrientInKitchen.name))
				)
			)
				.filter((r) => r.value != null)
				.map((r) => ({ nutrient_id: r.nutrient_id, name: r.name, value: Number(r.value) }))
		: (
				await runQuery("QUERY_FAILED", () =>
					db.query.ingredientNutrientInKitchen.findMany({
						columns: { nutrientId: true, nutrientValue: true },
						with: { nutrientInKitchen: { columns: { name: true, displayOrder: true } } },
						where: and(eq(ingredientNutrientInKitchen.ingredientId, ingredientId), isNull(ingredientNutrientInKitchen.deletedAt)),
					})
				)
			)
				.map((r) => ({
					nutrient_id: r.nutrientId,
					name: r.nutrientInKitchen?.name ?? null,
					value: Number(r.nutrientValue),
					_order: r.nutrientInKitchen?.displayOrder ?? 9999,
				}))
				.sort((a, b) => a._order - b._order || (a.name ?? "").localeCompare(b.name ?? ""))
				.map(({ _order, ...rest }) => rest)

	const itemRows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientItemInKitchen.findMany({
			columns: {
				id: true,
				description: true,
				barcode: true,
				purchaseMeasureUnit: true,
				unitContentQuantity: true,
				correctionFactor: true,
				purchaseItemId: true,
			},
			where: and(eq(ingredientItemInKitchen.ingredientId, ingredientId), isNull(ingredientItemInKitchen.deletedAt)),
			orderBy: (i, { asc }) => [asc(i.createdAt)],
		})
	)

	const product_items = itemRows.map((r) => ({
		id: r.id,
		description: r.description ?? null,
		barcode: r.barcode ?? null,
		purchase_measure_unit: r.purchaseMeasureUnit ?? null,
		unit_content_quantity: r.unitContentQuantity != null ? Number(r.unitContentQuantity) : null,
		correction_factor: r.correctionFactor != null ? Number(r.correctionFactor) : null,
		purchase_item_id: r.purchaseItemId ?? null,
	}))

	const linkRows = await runQuery("QUERY_FAILED", () =>
		db.query.purchaseItemIngredientInProcurement.findMany({
			columns: { id: true, conversionFactor: true, isDefault: true },
			with: {
				purchaseItemInProcurement: {
					columns: {
						id: true,
						description: true,
						catmatItemCodigo: true,
						catmatItemDescricao: true,
						purchaseMeasureUnit: true,
						unitPrice: true,
						deletedAt: true,
					},
				},
			},
			where: eq(purchaseItemIngredientInProcurement.ingredientId, ingredientId),
			orderBy: (l, { asc }) => [asc(l.createdAt)],
		})
	)

	const purchase_links = linkRows
		.map((r) => ({ r, pi: r.purchaseItemInProcurement }))
		.filter(({ pi }) => pi && pi.deletedAt == null)
		.map(({ r, pi }) => ({
			link_id: r.id,
			purchase_item_id: pi?.id as string,
			description: pi?.description ?? null,
			catmat_item_codigo: pi?.catmatItemCodigo != null ? Number(pi.catmatItemCodigo) : null,
			catmat_item_descricao: pi?.catmatItemDescricao ?? null,
			purchase_measure_unit: pi?.purchaseMeasureUnit ?? null,
			unit_price: pi?.unitPrice != null ? Number(pi.unitPrice) : null,
			conversion_factor: r.conversionFactor != null ? Number(r.conversionFactor) : null,
			is_default: Boolean(r.isDefault),
		}))

	return {
		ingredient: {
			description: ing.description ?? null,
			folder_id: ing.folderId ?? null,
			folder_description: folder?.description ?? null,
			measure_unit: ing.measureUnit ?? null,
			correction_factor: ing.correctionFactor != null ? Number(ing.correctionFactor) : null,
			ceafa_id: ing.ceafaId ?? null,
			ceafa_description: ceafa?.description ?? null,
		},
		nutrition_reference,
		nutrients,
		product_items,
		purchase_links,
	}
}

/**
 * Registra uma nova versão do insumo se o snapshot atual divergir da última registrada.
 * Idempotente: chamadas repetidas com o mesmo estado não criam versões duplicadas.
 * @returns a versão criada, ou null se nada mudou (dedup).
 */
export async function recordIngredientVersion(
	db: SisubDb,
	ctx: UserContext,
	input: RecordIngredientVersion,
	actor?: VersionActor
): Promise<IngredientVersionRow | null> {
	requirePermission(ctx, "kitchen", 1)

	const snapshot = await buildIngredientSnapshot(db, input.ingredientId)

	const latest = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientVersionInKitchen.findFirst({
			columns: { snapshot: true, versionNumber: true },
			where: eq(ingredientVersionInKitchen.ingredientId, input.ingredientId),
			orderBy: (v, { desc }) => [desc(v.versionNumber)],
		})
	)

	if (latest && stableStringify(latest.snapshot) === stableStringify(snapshot)) {
		return null // sem mudanças → não versiona (dedup)
	}

	const nextVersion = (latest?.versionNumber ?? 0) + 1

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(ingredientVersionInKitchen)
			.values({
				ingredientId: input.ingredientId,
				versionNumber: nextVersion,
				snapshot,
				changeSummary: input.changeSummary ?? null,
				changedBy: actor?.id ?? ctx.userId ?? null,
				changedByName: actor?.name ?? null,
			})
			.returning()
	)
	return toVersionRow(row)
}

export async function listIngredientVersions(db: SisubDb, ctx: UserContext, input: ListIngredientVersions): Promise<IngredientVersionRow[]> {
	requirePermission(ctx, "kitchen", 1)
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select()
			.from(ingredientVersionInKitchen)
			.where(eq(ingredientVersionInKitchen.ingredientId, input.ingredientId))
			.orderBy(desc(ingredientVersionInKitchen.versionNumber))
	)
	return rows.map((r) => toVersionRow(r))
}

/** Map da linha Drizzle (camelCase) → contrato `IngredientVersionRow` (snake_case). */
function toVersionRow(row: typeof ingredientVersionInKitchen.$inferSelect): IngredientVersionRow {
	return {
		id: row.id,
		ingredient_id: row.ingredientId,
		version_number: row.versionNumber,
		snapshot: row.snapshot as IngredientSnapshot,
		change_summary: row.changeSummary,
		changed_by: row.changedBy,
		changed_by_name: row.changedByName,
		created_at: row.createdAt,
	}
}

/**
 * Restaura o insumo ao estado de uma versão.
 * Reaplica: campos do insumo + nutrientes (substituição total) + reconciliação de itens
 * de produto (por id) + reconciliação de vínculos de compra (por purchase_item_id).
 * NÃO altera o catálogo compartilhado purchase_item (description/CATMAT/preço) — apenas o
 * conjunto de vínculos e seus fatores, que são "propriedade" do insumo.
 * Registra a própria restauração como nova versão.
 */
export async function restoreIngredientVersion(
	db: SisubDb,
	ctx: UserContext,
	input: RestoreIngredientVersion,
	actor?: VersionActor
): Promise<IngredientVersionRow | null> {
	requirePermission(ctx, "kitchen", 1)

	const version = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientVersionInKitchen.findFirst({
			where: and(eq(ingredientVersionInKitchen.id, input.versionId), eq(ingredientVersionInKitchen.ingredientId, input.ingredientId)),
		})
	)
	if (!version) throw new NotFoundError("ingredient_version", input.versionId)

	const snap = version.snapshot as IngredientSnapshot

	await runQuery("UPDATE_FAILED", () =>
		db.transaction(async (tx) => {
			// 1) Campos do insumo
			await tx
				.update(ingredientInKitchen)
				.set({
					description: snap.ingredient.description,
					folderId: snap.ingredient.folder_id,
					measureUnit: snap.ingredient.measure_unit,
					correctionFactor: snap.ingredient.correction_factor != null ? String(snap.ingredient.correction_factor) : null,
					ceafaId: snap.ingredient.ceafa_id,
				})
				.where(eq(ingredientInKitchen.id, input.ingredientId))

			// 2) Fonte nutricional + nutrientes. Snapshots vinculados restauram o link;
			// snapshots manuais limpam o link e repõem ingredient_nutrient.
			if (snap.nutrition_reference?.food_revision_id) {
				const revisionExists = await tx
					.select({ id: nutritionFoodItemRevisionInNutritionReference.id })
					.from(nutritionFoodItemRevisionInNutritionReference)
					.where(eq(nutritionFoodItemRevisionInNutritionReference.id, snap.nutrition_reference.food_revision_id))
					.limit(1)
				if (revisionExists.length > 0) {
					await tx
						.insert(ingredientNutritionReferenceInKitchen)
						.values({
							ingredientId: input.ingredientId,
							foodRevisionId: snap.nutrition_reference.food_revision_id,
							matchStatus: snap.nutrition_reference.match_status ?? "manual",
							linkedAt: new Date().toISOString(),
						})
						.onConflictDoUpdate({
							target: ingredientNutritionReferenceInKitchen.ingredientId,
							set: {
								foodRevisionId: snap.nutrition_reference.food_revision_id,
								matchStatus: snap.nutrition_reference.match_status ?? "manual",
								linkedAt: new Date().toISOString(),
							},
						})
				}
			} else {
				await tx.delete(ingredientNutritionReferenceInKitchen).where(eq(ingredientNutritionReferenceInKitchen.ingredientId, input.ingredientId))
				await replaceIngredientNutrients(
					tx,
					input.ingredientId,
					snap.nutrients.map((n) => ({ nutrientId: n.nutrient_id, nutrientValue: n.value }))
				)
			}

			// 3) Itens de produto (ingredient_item) — reconciliação por id
			const snapItemIds = new Set(snap.product_items.map((i) => i.id))
			const currentItems = await tx
				.select({ id: ingredientItemInKitchen.id })
				.from(ingredientItemInKitchen)
				.where(and(eq(ingredientItemInKitchen.ingredientId, input.ingredientId), isNull(ingredientItemInKitchen.deletedAt)))

			// soft-delete itens ativos que não existem no snapshot
			for (const cur of currentItems) {
				if (!snapItemIds.has(cur.id)) {
					await tx.update(ingredientItemInKitchen).set({ deletedAt: new Date().toISOString() }).where(eq(ingredientItemInKitchen.id, cur.id))
				}
			}
			// upsert itens do snapshot (recria/atualiza, garante deleted_at null)
			for (const item of snap.product_items) {
				const values = {
					id: item.id,
					ingredientId: input.ingredientId,
					description: item.description,
					barcode: item.barcode,
					purchaseMeasureUnit: item.purchase_measure_unit,
					unitContentQuantity: item.unit_content_quantity != null ? String(item.unit_content_quantity) : null,
					correctionFactor: item.correction_factor != null ? String(item.correction_factor) : null,
					purchaseItemId: item.purchase_item_id,
					deletedAt: null,
				}
				await tx.insert(ingredientItemInKitchen).values(values).onConflictDoUpdate({ target: ingredientItemInKitchen.id, set: values })
			}

			// 4) Vínculos de compra (purchase_item_ingredient) — reconciliação por purchase_item_id
			const snapLinkPiIds = new Set(snap.purchase_links.map((l) => l.purchase_item_id))
			const currentLinks = await tx
				.select({ id: purchaseItemIngredientInProcurement.id, purchaseItemId: purchaseItemIngredientInProcurement.purchaseItemId })
				.from(purchaseItemIngredientInProcurement)
				.where(eq(purchaseItemIngredientInProcurement.ingredientId, input.ingredientId))

			// remove vínculos atuais ausentes no snapshot
			for (const cur of currentLinks) {
				if (!snapLinkPiIds.has(cur.purchaseItemId)) {
					await tx.delete(purchaseItemIngredientInProcurement).where(eq(purchaseItemIngredientInProcurement.id, cur.id))
				}
			}
			// upsert vínculos do snapshot (apenas se o purchase_item ainda existir)
			for (const link of snap.purchase_links) {
				const piExists = await tx
					.select({ id: purchaseItemInProcurement.id })
					.from(purchaseItemInProcurement)
					.where(and(eq(purchaseItemInProcurement.id, link.purchase_item_id), isNull(purchaseItemInProcurement.deletedAt)))
					.limit(1)
				if (piExists.length === 0) continue // catálogo removido — não recria
				await tx
					.insert(purchaseItemIngredientInProcurement)
					.values({
						purchaseItemId: link.purchase_item_id,
						ingredientId: input.ingredientId,
						conversionFactor: link.conversion_factor != null ? String(link.conversion_factor) : "1.0",
						isDefault: link.is_default,
					})
					.onConflictDoUpdate({
						target: [purchaseItemIngredientInProcurement.purchaseItemId, purchaseItemIngredientInProcurement.ingredientId],
						set: {
							conversionFactor: link.conversion_factor != null ? String(link.conversion_factor) : "1.0",
							isDefault: link.is_default,
						},
					})
			}
		})
	)

	// 5) Registra a restauração como nova versão
	return recordIngredientVersion(db, ctx, { ingredientId: input.ingredientId, changeSummary: `Restaurado da versão ${version.versionNumber}` }, actor)
}
