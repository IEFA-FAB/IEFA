/**
 * Meal type operations — CRUD + soft-delete em `meal_type`. Drizzle query layer.
 *
 * Projeção via `db.select`/`.returning()` com colunas explícitas (padrão deste batch);
 * `meal_type` é flat (sem relations) → não usa o builder relacional `db.query`.
 */

import { mealTypeInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateMealType, DeleteMealType, FetchMealTypes, RestoreMealType, UpdateMealType } from "../schemas/meal-types.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

type MealType = Tables<"meal_type">

// Projeção snake_case do contrato (todas as colunas de meal_type).
const MEAL_TYPE_COLS = {
	id: mealTypeInSisub.id,
	created_at: mealTypeInSisub.createdAt,
	name: mealTypeInSisub.name,
	kitchen_id: mealTypeInSisub.kitchenId,
	sort_order: mealTypeInSisub.sortOrder,
	deleted_at: mealTypeInSisub.deletedAt,
} as const

export async function fetchMealTypes(db: SisubDb, ctx: UserContext, input: FetchMealTypes): Promise<MealType[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const conditions: (SQL | undefined)[] = [isNull(mealTypeInSisub.deletedAt)]
	if (input.kitchenId != null) {
		conditions.push(or(isNull(mealTypeInSisub.kitchenId), eq(mealTypeInSisub.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(mealTypeInSisub.kitchenId))
	}

	return runQuery("FETCH_FAILED", () =>
		db
			.select(MEAL_TYPE_COLS)
			.from(mealTypeInSisub)
			.where(and(...conditions))
			.orderBy(asc(mealTypeInSisub.sortOrder))
	)
}

export async function createMealType(db: SisubDb, ctx: UserContext, input: CreateMealType): Promise<MealType> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const [row] = await runQuery("INSERT_FAILED", () =>
		db
			.insert(mealTypeInSisub)
			.values({ name: input.name, sortOrder: input.sortOrder ?? null, kitchenId: input.kitchenId ?? null })
			.returning(MEAL_TYPE_COLS)
	)
	if (!row) throw new DomainError("INSERT_FAILED", "no row returned")
	return row
}

export async function updateMealType(db: SisubDb, ctx: UserContext, input: UpdateMealType): Promise<MealType> {
	requirePermission(ctx, "kitchen", 2)

	const updates: Partial<typeof mealTypeInSisub.$inferInsert> = {}
	if (input.name != null) updates.name = input.name
	if (input.sortOrder != null) updates.sortOrder = input.sortOrder
	if ("kitchenId" in input) updates.kitchenId = input.kitchenId ?? null

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const [row] = await runQuery("UPDATE_FAILED", () =>
		db.update(mealTypeInSisub).set(updates).where(eq(mealTypeInSisub.id, input.mealTypeId)).returning(MEAL_TYPE_COLS)
	)
	if (!row) throw new DomainError("UPDATE_FAILED", `meal_type ${input.mealTypeId} not found`)
	return row
}

export async function deleteMealType(db: SisubDb, ctx: UserContext, input: DeleteMealType): Promise<void> {
	requirePermission(ctx, "kitchen", 2)

	const deleted = await runQuery("DELETE_FAILED", () =>
		db
			.update(mealTypeInSisub)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(mealTypeInSisub.id, input.mealTypeId))
			.returning({ id: mealTypeInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `meal_type ${input.mealTypeId} not found`)
}

export async function restoreMealType(db: SisubDb, ctx: UserContext, input: RestoreMealType): Promise<void> {
	requirePermission(ctx, "kitchen", 2)

	const restored = await runQuery("RESTORE_FAILED", () =>
		db.update(mealTypeInSisub).set({ deletedAt: null }).where(eq(mealTypeInSisub.id, input.mealTypeId)).returning({ id: mealTypeInSisub.id })
	)
	if (restored.length === 0) throw new DomainError("RESTORE_FAILED", `meal_type ${input.mealTypeId} not found`)
}
