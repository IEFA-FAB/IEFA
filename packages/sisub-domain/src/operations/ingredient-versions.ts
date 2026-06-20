/**
 * Ingredient versioning operations: snapshot do agregado, dedup, registro e restauração de versões.
 * Drizzle query layer (migração PostgREST→Drizzle).
 *
 * `IngredientSnapshot`/`IngredientVersionRow` permanecem o contrato (snake_case) — o snapshot
 * jsonb deve espelhar o backfill SQL em 20260609_ingredient_versioning.sql. A restauração é
 * multi-statement → roda em `db.transaction`.
 */

import {
	ingredientInSisub,
	ingredientItemInSisub,
	ingredientNutrientInSisub,
	ingredientVersionInSisub,
	purchaseItemIngredientInSisub,
	purchaseItemInSisub,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, desc, eq, isNull } from "drizzle-orm"
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

/** Lê o agregado completo do insumo (perspectiva da tela de edição) → snapshot. */
export async function buildIngredientSnapshot(db: SisubDb, ingredientId: string): Promise<IngredientSnapshot> {
	const ing = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientInSisub.findFirst({
			columns: { description: true, folderId: true, measureUnit: true, correctionFactor: true, ceafaId: true },
			with: {
				folderInSisub: { columns: { description: true } },
				ceafaInSisub: { columns: { description: true } },
			},
			where: eq(ingredientInSisub.id, ingredientId),
		})
	)
	if (!ing) throw new NotFoundError("ingredient", ingredientId)

	const folder = ing.folderInSisub
	const ceafa = ing.ceafaInSisub

	const nutrientRows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientNutrientInSisub.findMany({
			columns: { nutrientId: true, nutrientValue: true },
			with: { nutrientInSisub: { columns: { name: true, displayOrder: true } } },
			where: and(eq(ingredientNutrientInSisub.ingredientId, ingredientId), isNull(ingredientNutrientInSisub.deletedAt)),
		})
	)

	const nutrients = nutrientRows
		.map((r) => ({
			nutrient_id: r.nutrientId,
			name: r.nutrientInSisub?.name ?? null,
			value: Number(r.nutrientValue),
			_order: r.nutrientInSisub?.displayOrder ?? 9999,
		}))
		.sort((a, b) => a._order - b._order || (a.name ?? "").localeCompare(b.name ?? ""))
		.map(({ _order, ...rest }) => rest)

	const itemRows = await runQuery("QUERY_FAILED", () =>
		db.query.ingredientItemInSisub.findMany({
			columns: {
				id: true,
				description: true,
				barcode: true,
				purchaseMeasureUnit: true,
				unitContentQuantity: true,
				correctionFactor: true,
				purchaseItemId: true,
			},
			where: and(eq(ingredientItemInSisub.ingredientId, ingredientId), isNull(ingredientItemInSisub.deletedAt)),
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
		db.query.purchaseItemIngredientInSisub.findMany({
			columns: { id: true, conversionFactor: true, isDefault: true },
			with: {
				purchaseItemInSisub: {
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
			where: eq(purchaseItemIngredientInSisub.ingredientId, ingredientId),
			orderBy: (l, { asc }) => [asc(l.createdAt)],
		})
	)

	const purchase_links = linkRows
		.map((r) => ({ r, pi: r.purchaseItemInSisub }))
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
		db.query.ingredientVersionInSisub.findFirst({
			columns: { snapshot: true, versionNumber: true },
			where: eq(ingredientVersionInSisub.ingredientId, input.ingredientId),
			orderBy: (v, { desc }) => [desc(v.versionNumber)],
		})
	)

	if (latest && stableStringify(latest.snapshot) === stableStringify(snapshot)) {
		return null // sem mudanças → não versiona (dedup)
	}

	const nextVersion = (latest?.versionNumber ?? 0) + 1

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(ingredientVersionInSisub)
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
			.from(ingredientVersionInSisub)
			.where(eq(ingredientVersionInSisub.ingredientId, input.ingredientId))
			.orderBy(desc(ingredientVersionInSisub.versionNumber))
	)
	return rows.map((r) => toVersionRow(r))
}

/** Map da linha Drizzle (camelCase) → contrato `IngredientVersionRow` (snake_case). */
function toVersionRow(row: typeof ingredientVersionInSisub.$inferSelect): IngredientVersionRow {
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
		db.query.ingredientVersionInSisub.findFirst({
			where: and(eq(ingredientVersionInSisub.id, input.versionId), eq(ingredientVersionInSisub.ingredientId, input.ingredientId)),
		})
	)
	if (!version) throw new NotFoundError("ingredient_version", input.versionId)

	const snap = version.snapshot as IngredientSnapshot

	await runQuery("UPDATE_FAILED", () =>
		db.transaction(async (tx) => {
			// 1) Campos do insumo
			await tx
				.update(ingredientInSisub)
				.set({
					description: snap.ingredient.description,
					folderId: snap.ingredient.folder_id,
					measureUnit: snap.ingredient.measure_unit,
					correctionFactor: snap.ingredient.correction_factor != null ? String(snap.ingredient.correction_factor) : null,
					ceafaId: snap.ingredient.ceafa_id,
				})
				.where(eq(ingredientInSisub.id, input.ingredientId))

			// 2) Nutrientes — substituição total (soft-delete ativos, reinsere do snapshot)
			await replaceIngredientNutrients(
				tx,
				input.ingredientId,
				snap.nutrients.map((n) => ({ nutrientId: n.nutrient_id, nutrientValue: n.value }))
			)

			// 3) Itens de produto (ingredient_item) — reconciliação por id
			const snapItemIds = new Set(snap.product_items.map((i) => i.id))
			const currentItems = await tx
				.select({ id: ingredientItemInSisub.id })
				.from(ingredientItemInSisub)
				.where(and(eq(ingredientItemInSisub.ingredientId, input.ingredientId), isNull(ingredientItemInSisub.deletedAt)))

			// soft-delete itens ativos que não existem no snapshot
			for (const cur of currentItems) {
				if (!snapItemIds.has(cur.id)) {
					await tx.update(ingredientItemInSisub).set({ deletedAt: new Date().toISOString() }).where(eq(ingredientItemInSisub.id, cur.id))
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
				await tx.insert(ingredientItemInSisub).values(values).onConflictDoUpdate({ target: ingredientItemInSisub.id, set: values })
			}

			// 4) Vínculos de compra (purchase_item_ingredient) — reconciliação por purchase_item_id
			const snapLinkPiIds = new Set(snap.purchase_links.map((l) => l.purchase_item_id))
			const currentLinks = await tx
				.select({ id: purchaseItemIngredientInSisub.id, purchaseItemId: purchaseItemIngredientInSisub.purchaseItemId })
				.from(purchaseItemIngredientInSisub)
				.where(eq(purchaseItemIngredientInSisub.ingredientId, input.ingredientId))

			// remove vínculos atuais ausentes no snapshot
			for (const cur of currentLinks) {
				if (!snapLinkPiIds.has(cur.purchaseItemId)) {
					await tx.delete(purchaseItemIngredientInSisub).where(eq(purchaseItemIngredientInSisub.id, cur.id))
				}
			}
			// upsert vínculos do snapshot (apenas se o purchase_item ainda existir)
			for (const link of snap.purchase_links) {
				const piExists = await tx
					.select({ id: purchaseItemInSisub.id })
					.from(purchaseItemInSisub)
					.where(and(eq(purchaseItemInSisub.id, link.purchase_item_id), isNull(purchaseItemInSisub.deletedAt)))
					.limit(1)
				if (piExists.length === 0) continue // catálogo removido — não recria
				await tx
					.insert(purchaseItemIngredientInSisub)
					.values({
						purchaseItemId: link.purchase_item_id,
						ingredientId: input.ingredientId,
						conversionFactor: link.conversion_factor != null ? String(link.conversion_factor) : "1.0",
						isDefault: link.is_default,
					})
					.onConflictDoUpdate({
						target: [purchaseItemIngredientInSisub.purchaseItemId, purchaseItemIngredientInSisub.ingredientId],
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
