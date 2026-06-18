/**
 * Purchase item operations: CRUD for purchase_item + purchase_item_ingredient junction.
 *
 * Auth posture preserved from the original server functions: reads have no PBAC
 * guard; mutations were authenticated-only (no module-level guard). The thin
 * wrappers call requireAuth() and pass ctx; ops do not use it.
 *
 * Special error messages (`Falha ... [code]: message`) preserved verbatim.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
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

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchPurchaseItems(client: AnyClient, _ctx: UserContext, input: FetchPurchaseItems) {
	let query = client.from("purchase_item").select("*").is("deleted_at", null).order("description", { ascending: true }).limit(100)

	if (input.search?.trim()) {
		query = query.ilike("description", `%${input.search.trim()}%`)
	}

	const { data: result, error } = await query
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return result || []
}

/**
 * Lista os purchase_items correlacionados a um ingredient (via junção),
 * achatando os dados do vínculo (link_id, conversion_factor, is_default).
 */
export async function fetchIngredientPurchaseItems(client: AnyClient, _ctx: UserContext, input: FetchIngredientPurchaseItems) {
	const { data: result, error } = await client
		.from("purchase_item_ingredient")
		.select("id, conversion_factor, is_default, purchase_item:purchase_item_id!inner(*)")
		.eq("ingredient_id", input.ingredientId)
		.is("purchase_item.deleted_at", null)
		.order("created_at", { ascending: true })

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return (result ?? []).map((row) => {
		const pi = Array.isArray(row.purchase_item) ? row.purchase_item[0] : row.purchase_item
		return { link_id: row.id, conversion_factor: row.conversion_factor, is_default: row.is_default, ...pi }
	})
}

export async function fetchPurchaseItem(client: AnyClient, _ctx: UserContext, input: FetchPurchaseItem) {
	const { data: result, error } = await client
		.from("purchase_item")
		.select(
			"*, purchase_item_ingredient(id, ingredient_id, conversion_factor, conversion_notes, is_default, ingredient:ingredient_id(id, description, measure_unit))"
		)
		.eq("id", input.id)
		.is("deleted_at", null)
		.single()

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return result
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createPurchaseItem(client: AnyClient, _ctx: UserContext, input: CreatePurchaseItem) {
	const { data: result, error } = await client.from("purchase_item").insert(input.payload).select().single()

	if (error) throw new DomainError("INSERT_FAILED", `Falha ao criar item de compra [${error.code}]: ${error.message}`)
	return result
}

export async function updatePurchaseItem(client: AnyClient, _ctx: UserContext, input: UpdatePurchaseItem) {
	const { data: result, error } = await client
		.from("purchase_item")
		.update({ ...input.payload, updated_at: new Date().toISOString() })
		.eq("id", input.id)
		.select()
		.single()

	if (error) throw new DomainError("UPDATE_FAILED", `Falha ao atualizar item de compra [${error.code}]: ${error.message}`)
	return result
}

export async function deletePurchaseItem(client: AnyClient, _ctx: UserContext, input: DeletePurchaseItem) {
	const { error } = await client.from("purchase_item").update({ deleted_at: new Date().toISOString() }).eq("id", input.id)

	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export async function fetchPurchaseItemIngredients(client: AnyClient, _ctx: UserContext, input: FetchPurchaseItemIngredients) {
	const { data: result, error } = await client
		.from("purchase_item_ingredient")
		.select("*, ingredient:ingredient_id(id, description, measure_unit)")
		.eq("purchase_item_id", input.purchaseItemId)

	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return result || []
}

export async function upsertPurchaseItemIngredient(client: AnyClient, _ctx: UserContext, input: UpsertPurchaseItemIngredient) {
	const { data: result, error } = await client
		.from("purchase_item_ingredient")
		.upsert(input.payload, { onConflict: "purchase_item_id,ingredient_id" })
		.select()
		.single()

	if (error) throw new DomainError("INSERT_FAILED", `Falha ao vincular ingrediente [${error.code}]: ${error.message}`)
	return result
}

export async function deletePurchaseItemIngredient(client: AnyClient, _ctx: UserContext, input: DeletePurchaseItemIngredient) {
	const { error } = await client.from("purchase_item_ingredient").delete().eq("id", input.id)

	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function setDefaultPurchaseItemIngredient(client: AnyClient, _ctx: UserContext, input: SetDefaultPurchaseItemIngredient) {
	// Clear existing defaults for this purchase_item, then set the new one
	await client.from("purchase_item_ingredient").update({ is_default: false }).eq("purchase_item_id", input.purchaseItemId)
	const { error } = await client.from("purchase_item_ingredient").update({ is_default: true }).eq("id", input.id)

	if (error) throw new DomainError("UPDATE_FAILED", error.message)
}
