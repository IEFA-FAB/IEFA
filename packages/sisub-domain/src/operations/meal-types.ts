/**
 * Meal type operations — CRUD + soft-delete em `meal_type`. Drizzle query layer.
 *
 * Projeção via `db.select`/`.returning()` com colunas explícitas (padrão deste batch);
 * `meal_type` é flat (sem relations) → não usa o builder relacional `db.query`.
 */

import { mealTypeInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm"
import { authorizeAssetMutation, requireAssetWriteForScope } from "../guards/asset-ownership.ts"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateMealType, DeleteMealType, FetchMealTypes, RestoreMealType, UpdateMealType } from "../schemas/meal-types.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

type MealType = Tables<"meal_type">

// Projeção snake_case do contrato (todas as colunas de meal_type).
const MEAL_TYPE_COLS = {
	id: mealTypeInKitchen.id,
	created_at: mealTypeInKitchen.createdAt,
	name: mealTypeInKitchen.name,
	kitchen_id: mealTypeInKitchen.kitchenId,
	sort_order: mealTypeInKitchen.sortOrder,
	deleted_at: mealTypeInKitchen.deletedAt,
} as const

/**
 * Predicado de mutação amarrado ao dono que FOI autorizado.
 *
 * A checagem de posse e a mutação são queries separadas: entre uma e outra, outra requisição
 * pode reparentar a linha, e um `where id = ?` cru aplicaria a escrita a um ativo que já não
 * pertence à cozinha autorizada. Repetir o dono no predicado faz a mutação simplesmente não
 * casar nada nesse caso — `mutateOrFail` então falha, em vez de escrever no lugar errado.
 */
function ownedBy(mealTypeId: string, ownerKitchenId: number | null) {
	return and(
		eq(mealTypeInKitchen.id, mealTypeId),
		ownerKitchenId == null ? isNull(mealTypeInKitchen.kitchenId) : eq(mealTypeInKitchen.kitchenId, ownerKitchenId)
	)
}

export async function fetchMealTypes(db: SisubDb, ctx: UserContext, input: FetchMealTypes): Promise<MealType[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const conditions: (SQL | undefined)[] = [isNull(mealTypeInKitchen.deletedAt)]
	if (input.kitchenId != null) {
		conditions.push(or(isNull(mealTypeInKitchen.kitchenId), eq(mealTypeInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(mealTypeInKitchen.kitchenId))
	}

	return runQuery("FETCH_FAILED", () =>
		db
			.select(MEAL_TYPE_COLS)
			.from(mealTypeInKitchen)
			.where(and(...conditions))
			.orderBy(asc(mealTypeInKitchen.sortOrder))
	)
}

export async function createMealType(db: SisubDb, ctx: UserContext, input: CreateMealType): Promise<MealType> {
	// kitchenId ausente = tipo de refeição GLOBAL (da SDAB) → exige global:2, não kitchen:2.
	requireAssetWriteForScope(ctx, input.kitchenId ?? null)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(mealTypeInKitchen)
			.values({ name: input.name, sortOrder: input.sortOrder ?? null, kitchenId: input.kitchenId ?? null })
			.returning(MEAL_TYPE_COLS)
	)
	return row
}

export async function updateMealType(db: SisubDb, ctx: UserContext, input: UpdateMealType): Promise<MealType> {
	// Autoriza pelo DONO da linha (lido do banco), não pelo escopo vindo da requisição.
	const ownerKitchenId = await authorizeAssetMutation(db, ctx, "meal_type", input.mealTypeId)

	const updates: Partial<typeof mealTypeInKitchen.$inferInsert> = {}
	if (input.name != null) updates.name = input.name
	if (input.sortOrder != null) updates.sortOrder = input.sortOrder
	// Reparentar é mover de escopo: exige permissão no DESTINO também, senão `kitchenId: null`
	// promoveria um tipo local a global (kitchen:2 criando conteúdo da SDAB).
	if ("kitchenId" in input) {
		requireAssetWriteForScope(ctx, input.kitchenId ?? null)
		updates.kitchenId = input.kitchenId ?? null
	}

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const row = await insertOneOrFail("UPDATE_FAILED", `meal_type ${input.mealTypeId} not found`, () =>
		db.update(mealTypeInKitchen).set(updates).where(ownedBy(input.mealTypeId, ownerKitchenId)).returning(MEAL_TYPE_COLS)
	)
	return row
}

export async function deleteMealType(db: SisubDb, ctx: UserContext, input: DeleteMealType): Promise<void> {
	const ownerKitchenId = await authorizeAssetMutation(db, ctx, "meal_type", input.mealTypeId)

	await mutateOrFail("DELETE_FAILED", `meal_type ${input.mealTypeId} not found`, () =>
		db
			.update(mealTypeInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(ownedBy(input.mealTypeId, ownerKitchenId))
			.returning({ id: mealTypeInKitchen.id })
	)
}

export async function restoreMealType(db: SisubDb, ctx: UserContext, input: RestoreMealType): Promise<void> {
	const ownerKitchenId = await authorizeAssetMutation(db, ctx, "meal_type", input.mealTypeId)

	await mutateOrFail("RESTORE_FAILED", `meal_type ${input.mealTypeId} not found`, () =>
		db.update(mealTypeInKitchen).set({ deletedAt: null }).where(ownedBy(input.mealTypeId, ownerKitchenId)).returning({ id: mealTypeInKitchen.id })
	)
}
