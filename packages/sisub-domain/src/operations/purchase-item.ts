/**
 * Purchase item operations: CRUD for purchase_item + purchase_item_ingredient junction. Drizzle query layer.
 *
 * Auth posture preserved: reads have no PBAC guard; mutations were authenticated-only.
 * Mensagens de erro especiais (`Falha ... [code]: message`) preservadas (prefixo + code + msg do driver).
 */

import { purchaseItemIngredientInSisub, purchaseItemInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
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
import { runQuery, toColumns, toWire } from "../utils/index.ts"

type PurchaseItem = Tables<"purchase_item">
type PurchaseItemIngredient = Tables<"purchase_item_ingredient">
type PurchaseItemInsert = typeof purchaseItemInSisub.$inferInsert
type PurchaseItemIngredientInsert = typeof purchaseItemIngredientInSisub.$inferInsert

type IngredientRef = { id: string; description: string | null; measure_unit: string | null }
type PurchaseItemIngredientWire = PurchaseItemIngredient & { ingredient: IngredientRef | null }
type PurchaseItemDetail = PurchaseItem & {
	purchase_item_ingredient: Array<
		Pick<PurchaseItemIngredient, "id" | "ingredient_id" | "conversion_factor" | "conversion_notes" | "is_default"> & { ingredient: IngredientRef | null }
	>
}
type PurchaseItemWithLink = PurchaseItem & { link_id: string; conversion_factor: number; is_default: boolean }

const PI_INGREDIENT_RELATIONS: Record<string, string> = { purchaseItemIngredientInSisubs: "purchase_item_ingredient", ingredientInSisub: "ingredient" }
const INGREDIENT_COLS = { columns: { id: true, description: true, measureUnit: true } } as const

/** Erro com o prefixo verbatim + `[code]` do PG (postgres.js expõe `.code`) + mensagem do driver. */
async function piOp<T>(code: string, prefix: string, op: () => Promise<T>): Promise<T> {
	try {
		return await op()
	} catch (e) {
		if (e instanceof DomainError) throw e
		const pg = e as { code?: string; message?: string }
		throw new DomainError(code, `${prefix} [${pg.code}]: ${pg.message ?? String(e)}`)
	}
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchPurchaseItems(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItems): Promise<PurchaseItem[]> {
	const search = input.search?.trim()
	const where = search
		? // escapa metacaracteres LIKE (\ % _) p/ busca literal
			and(isNull(purchaseItemInSisub.deletedAt), ilike(purchaseItemInSisub.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`))
		: isNull(purchaseItemInSisub.deletedAt)

	const rows = await runQuery("FETCH_FAILED", () => db.select().from(purchaseItemInSisub).where(where).orderBy(asc(purchaseItemInSisub.description)).limit(100))
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
				link_id: purchaseItemIngredientInSisub.id,
				conversion_factor: purchaseItemIngredientInSisub.conversionFactor,
				is_default: purchaseItemIngredientInSisub.isDefault,
				pi: purchaseItemInSisub,
			})
			.from(purchaseItemIngredientInSisub)
			.innerJoin(purchaseItemInSisub, eq(purchaseItemIngredientInSisub.purchaseItemId, purchaseItemInSisub.id))
			.where(and(eq(purchaseItemIngredientInSisub.ingredientId, input.ingredientId), isNull(purchaseItemInSisub.deletedAt)))
			.orderBy(asc(purchaseItemIngredientInSisub.createdAt))
	)
	// conversion_factor numeric → number (contrato PurchaseItemWithLink; coluna é NOT NULL).
	return rows.map((r) => ({ ...toWire<PurchaseItem>(r.pi), link_id: r.link_id, conversion_factor: Number(r.conversion_factor), is_default: r.is_default }))
}

export async function fetchPurchaseItem(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItem) {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.purchaseItemInSisub.findFirst({
			with: {
				purchaseItemIngredientInSisubs: {
					columns: { id: true, ingredientId: true, conversionFactor: true, conversionNotes: true, isDefault: true },
					with: { ingredientInSisub: INGREDIENT_COLS },
				},
			},
			where: and(eq(purchaseItemInSisub.id, input.id), isNull(purchaseItemInSisub.deletedAt)),
		})
	)
	if (!row) throw new DomainError("FETCH_FAILED", `purchase_item ${input.id} not found`)
	return toWire<PurchaseItemDetail>(row, PI_INGREDIENT_RELATIONS)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createPurchaseItem(db: SisubDb, _ctx: UserContext, input: CreatePurchaseItem) {
	const [row] = await piOp("INSERT_FAILED", "Falha ao criar item de compra", () =>
		db.insert(purchaseItemInSisub).values(toColumns<PurchaseItemInsert>(input.payload)).returning()
	)
	if (!row) throw new DomainError("INSERT_FAILED", "Falha ao criar item de compra: no row returned")
	return toWire<PurchaseItem>(row)
}

export async function updatePurchaseItem(db: SisubDb, _ctx: UserContext, input: UpdatePurchaseItem) {
	const set = { ...toColumns<Partial<PurchaseItemInsert>>(input.payload), updatedAt: new Date().toISOString() }
	const [row] = await piOp("UPDATE_FAILED", "Falha ao atualizar item de compra", () =>
		db.update(purchaseItemInSisub).set(set).where(eq(purchaseItemInSisub.id, input.id)).returning()
	)
	if (!row) throw new DomainError("UPDATE_FAILED", `Falha ao atualizar item de compra: ${input.id} não encontrado`)
	return toWire<PurchaseItem>(row)
}

export async function deletePurchaseItem(db: SisubDb, _ctx: UserContext, input: DeletePurchaseItem) {
	const deleted = await runQuery("DELETE_FAILED", () =>
		db
			.update(purchaseItemInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(purchaseItemInSisub.id, input.id))
			.returning({ id: purchaseItemInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `purchase_item ${input.id} not found`)
}

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export async function fetchPurchaseItemIngredients(db: SisubDb, _ctx: UserContext, input: FetchPurchaseItemIngredients) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.purchaseItemIngredientInSisub.findMany({
			with: { ingredientInSisub: INGREDIENT_COLS },
			where: eq(purchaseItemIngredientInSisub.purchaseItemId, input.purchaseItemId),
		})
	)
	return rows.map((r) => toWire<PurchaseItemIngredientWire>(r, PI_INGREDIENT_RELATIONS))
}

export async function upsertPurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: UpsertPurchaseItemIngredient) {
	const values = toColumns<PurchaseItemIngredientInsert>(input.payload)
	const [row] = await piOp("INSERT_FAILED", "Falha ao vincular ingrediente", () =>
		db
			.insert(purchaseItemIngredientInSisub)
			.values(values)
			.onConflictDoUpdate({ target: [purchaseItemIngredientInSisub.purchaseItemId, purchaseItemIngredientInSisub.ingredientId], set: values })
			.returning()
	)
	if (!row) throw new DomainError("INSERT_FAILED", "Falha ao vincular ingrediente: no row returned")
	return toWire<PurchaseItemIngredient>(row)
}

export async function deletePurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: DeletePurchaseItemIngredient) {
	const deleted = await runQuery("DELETE_FAILED", () =>
		db.delete(purchaseItemIngredientInSisub).where(eq(purchaseItemIngredientInSisub.id, input.id)).returning({ id: purchaseItemIngredientInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `purchase_item_ingredient ${input.id} not found`)
}

export async function setDefaultPurchaseItemIngredient(db: SisubDb, _ctx: UserContext, input: SetDefaultPurchaseItemIngredient) {
	// Atômico: zera os defaults da compra e marca o novo — em transação para não deixar
	// o purchase_item sem default (ou com dois) se o segundo update falhar.
	await runQuery("UPDATE_FAILED", () =>
		db.transaction(async (tx) => {
			await tx.update(purchaseItemIngredientInSisub).set({ isDefault: false }).where(eq(purchaseItemIngredientInSisub.purchaseItemId, input.purchaseItemId))
			await tx.update(purchaseItemIngredientInSisub).set({ isDefault: true }).where(eq(purchaseItemIngredientInSisub.id, input.id))
		})
	)
}
