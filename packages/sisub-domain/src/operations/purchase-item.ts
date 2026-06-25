/**
 * Purchase item operations: CRUD for purchase_item + purchase_item_ingredient junction. Drizzle query layer.
 *
 * Auth posture preserved: reads have no PBAC guard; mutations were authenticated-only.
 * Mensagens de erro especiais (`Falha ... [code]: message`) preservadas (prefixo + code + msg do driver).
 */

import { purchaseItemIngredientInProcurement, purchaseItemInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, ilike, isNull } from "drizzle-orm"
import type {
	CreatePurchaseItem,
	DeletePurchaseItem,
	DeletePurchaseItemIngredient,
	FetchIngredientPurchaseItems,
	FetchPurchaseItem,
	FetchPurchaseItemIngredients,
	FetchPurchaseItems,
	SetDefaultPurchaseItemIngredient,
	UpdatePurchaseItem,
	UpsertPurchaseItemIngredient,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type PurchaseItem = Tables<"purchase_item">
type PurchaseItemIngredient = Tables<"purchase_item_ingredient">
type PurchaseItemInsert = typeof purchaseItemInProcurement.$inferInsert
type PurchaseItemIngredientInsert = typeof purchaseItemIngredientInProcurement.$inferInsert

type IngredientRef = { id: string; description: string | null; measure_unit: string | null }
type PurchaseItemIngredientWire = PurchaseItemIngredient & { ingredient: IngredientRef | null }
type PurchaseItemDetail = PurchaseItem & {
	purchase_item_ingredient: Array<
		Pick<PurchaseItemIngredient, "id" | "ingredient_id" | "conversion_factor" | "conversion_notes" | "is_default"> & { ingredient: IngredientRef | null }
	>
}
type PurchaseItemWithLink = PurchaseItem & { link_id: string; conversion_factor: number; is_default: boolean }

const PI_INGREDIENT_RELATIONS: Record<string, string> = { purchaseItemIngredientInProcurements: "purchase_item_ingredient", ingredientInKitchen: "ingredient" }
const INGREDIENT_COLS = { columns: { id: true, description: true, measureUnit: true } } as const

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchPurchaseItems(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItems): Promise<PurchaseItem[]> {
	const search = input.search?.trim()
	const where = search
		? // escapa metacaracteres LIKE (\ % _) p/ busca literal
			and(isNull(purchaseItemInProcurement.deletedAt), ilike(purchaseItemInProcurement.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`))
		: isNull(purchaseItemInProcurement.deletedAt)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.select().from(purchaseItemInProcurement).where(where).orderBy(asc(purchaseItemInProcurement.description)).limit(100)
	)
	return rows.map((r) => toWire<PurchaseItem>(r))
}

/**
 * Lista os purchase_items correlacionados a um ingredient (via junção),
 * achatando os dados do vínculo (link_id, conversion_factor, is_default).
 */
export async function fetchIngredientPurchaseItems(db: SisubDb, _ctx: UserContext, input: FetchIngredientPurchaseItems): Promise<PurchaseItemWithLink[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				link_id: purchaseItemIngredientInProcurement.id,
				conversion_factor: purchaseItemIngredientInProcurement.conversionFactor,
				is_default: purchaseItemIngredientInProcurement.isDefault,
				pi: purchaseItemInProcurement,
			})
			.from(purchaseItemIngredientInProcurement)
			.innerJoin(purchaseItemInProcurement, eq(purchaseItemIngredientInProcurement.purchaseItemId, purchaseItemInProcurement.id))
			.where(and(eq(purchaseItemIngredientInProcurement.ingredientId, input.ingredientId), isNull(purchaseItemInProcurement.deletedAt)))
			.orderBy(asc(purchaseItemIngredientInProcurement.createdAt))
	)
	// conversion_factor numeric → number (contrato PurchaseItemWithLink; coluna é NOT NULL).
	return rows.map((r) => ({ ...toWire<PurchaseItem>(r.pi), link_id: r.link_id, conversion_factor: Number(r.conversion_factor), is_default: r.is_default }))
}

export async function fetchPurchaseItem(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItem) {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.purchaseItemInProcurement.findFirst({
			with: {
				purchaseItemIngredientInProcurements: {
					columns: { id: true, ingredientId: true, conversionFactor: true, conversionNotes: true, isDefault: true },
					with: { ingredientInKitchen: INGREDIENT_COLS },
				},
			},
			where: and(eq(purchaseItemInProcurement.id, input.id), isNull(purchaseItemInProcurement.deletedAt)),
		})
	)
	if (!row) throw new DomainError("FETCH_FAILED", `purchase_item ${input.id} not found`)
	return toWire<PurchaseItemDetail>(row, PI_INGREDIENT_RELATIONS)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createPurchaseItem(db: SisubDb, _ctx: UserContext, input: CreatePurchaseItem) {
	const row = await insertOneOrFail(
		"INSERT_FAILED",
		"Falha ao criar item de compra: no row returned",
		() => db.insert(purchaseItemInProcurement).values(toColumns<PurchaseItemInsert>(input.payload)).returning(),
		{ prefix: "Falha ao criar item de compra", includeCode: true }
	)
	return toWire<PurchaseItem>(row)
}

export async function updatePurchaseItem(db: SisubDb, _ctx: UserContext, input: UpdatePurchaseItem) {
	const set = { ...toColumns<Partial<PurchaseItemInsert>>(input.payload), updatedAt: new Date().toISOString() }
	const row = await insertOneOrFail(
		"UPDATE_FAILED",
		`Falha ao atualizar item de compra: ${input.id} não encontrado`,
		() => db.update(purchaseItemInProcurement).set(set).where(eq(purchaseItemInProcurement.id, input.id)).returning(),
		{ prefix: "Falha ao atualizar item de compra", includeCode: true }
	)
	return toWire<PurchaseItem>(row)
}

export async function deletePurchaseItem(db: SisubDb, _ctx: UserContext, input: DeletePurchaseItem) {
	await mutateOrFail("DELETE_FAILED", `purchase_item ${input.id} not found`, () =>
		db
			.update(purchaseItemInProcurement)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(purchaseItemInProcurement.id, input.id))
			.returning({ id: purchaseItemInProcurement.id })
	)
}

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export async function fetchPurchaseItemIngredients(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItemIngredients) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.purchaseItemIngredientInProcurement.findMany({
			with: { ingredientInKitchen: INGREDIENT_COLS },
			where: eq(purchaseItemIngredientInProcurement.purchaseItemId, input.purchaseItemId),
		})
	)
	return rows.map((r) => toWire<PurchaseItemIngredientWire>(r, PI_INGREDIENT_RELATIONS))
}

export async function upsertPurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: UpsertPurchaseItemIngredient) {
	const values = toColumns<PurchaseItemIngredientInsert>(input.payload)
	const row = await insertOneOrFail(
		"INSERT_FAILED",
		"Falha ao vincular ingrediente: no row returned",
		() =>
			db
				.insert(purchaseItemIngredientInProcurement)
				.values(values)
				.onConflictDoUpdate({ target: [purchaseItemIngredientInProcurement.purchaseItemId, purchaseItemIngredientInProcurement.ingredientId], set: values })
				.returning(),
		{ prefix: "Falha ao vincular ingrediente", includeCode: true }
	)
	return toWire<PurchaseItemIngredient>(row)
}

export async function deletePurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: DeletePurchaseItemIngredient) {
	await mutateOrFail("DELETE_FAILED", `purchase_item_ingredient ${input.id} not found`, () =>
		db
			.delete(purchaseItemIngredientInProcurement)
			.where(eq(purchaseItemIngredientInProcurement.id, input.id))
			.returning({ id: purchaseItemIngredientInProcurement.id })
	)
}

export async function setDefaultPurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: SetDefaultPurchaseItemIngredient) {
	// Atômico: zera os defaults da compra e marca o novo — em transação para não deixar
	// o purchase_item sem default (ou com dois) se o segundo update falhar.
	await runQuery("UPDATE_FAILED", () =>
		db.transaction(async (tx) => {
			await tx
				.update(purchaseItemIngredientInProcurement)
				.set({ isDefault: false })
				.where(eq(purchaseItemIngredientInProcurement.purchaseItemId, input.purchaseItemId))
			const marked = await tx
				.update(purchaseItemIngredientInProcurement)
				.set({ isDefault: true })
				.where(eq(purchaseItemIngredientInProcurement.id, input.id))
				.returning({ id: purchaseItemIngredientInProcurement.id })
			// id inexistente → 2º update afeta 0 linhas; lançar reverte o clear-all (senão ficaria sem default).
			if (marked.length === 0) throw new DomainError("UPDATE_FAILED", `purchase_item_ingredient ${input.id} not found`)
		})
	)
}
