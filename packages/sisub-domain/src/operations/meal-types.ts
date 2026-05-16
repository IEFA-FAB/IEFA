import type { SupabaseClient } from "@supabase/supabase-js"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateMealType, DeleteMealType, FetchMealTypes, RestoreMealType, UpdateMealType } from "../schemas/meal-types.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function fetchMealTypes(client: AnyClient, ctx: UserContext, input: FetchMealTypes) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	let query = client.from("meal_type").select("*").is("deleted_at", null).order("sort_order")

	if (input.kitchenId != null) {
		query = query.or(`kitchen_id.is.null,kitchen_id.eq.${input.kitchenId}`)
	} else {
		query = query.is("kitchen_id", null)
	}

	const { data, error } = await query
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function createMealType(client: AnyClient, ctx: UserContext, input: CreateMealType) {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 2, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 2)
	}

	const { data, error } = await client
		.from("meal_type")
		.insert({
			name: input.name,
			sort_order: input.sortOrder ?? null,
			kitchen_id: input.kitchenId ?? null,
		})
		.select()
		.single()

	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function updateMealType(client: AnyClient, ctx: UserContext, input: UpdateMealType) {
	requirePermission(ctx, "kitchen", 2)

	const updates: Record<string, unknown> = {}
	if (input.name != null) updates.name = input.name
	if (input.sortOrder != null) updates.sort_order = input.sortOrder
	if ("kitchenId" in input) updates.kitchen_id = input.kitchenId ?? null

	if (Object.keys(updates).length === 0) throw new DomainError("NO_UPDATES", "No fields to update")

	const { data, error } = await client.from("meal_type").update(updates).eq("id", input.mealTypeId).select().single()

	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function deleteMealType(client: AnyClient, ctx: UserContext, input: DeleteMealType) {
	requirePermission(ctx, "kitchen", 2)

	const { error } = await client.from("meal_type").update({ deleted_at: new Date().toISOString() }).eq("id", input.mealTypeId)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function restoreMealType(client: AnyClient, ctx: UserContext, input: RestoreMealType) {
	requirePermission(ctx, "kitchen", 2)

	const { error } = await client.from("meal_type").update({ deleted_at: null }).eq("id", input.mealTypeId)
	if (error) throw new DomainError("RESTORE_FAILED", error.message)
}
