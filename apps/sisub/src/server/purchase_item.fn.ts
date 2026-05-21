/**
 * @module purchase_item.fn
 * CRUD for purchase_item + purchase_item_ingredient junction.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: purchase_item, purchase_item_ingredient.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import { PurchaseItemIngredientWriteSchema, PurchaseItemWriteSchema } from "./purchase_item.schemas"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchPurchaseItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ search: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("purchase_item").select("*").is("deleted_at", null).order("description", { ascending: true }).limit(100)

		if (data.search?.trim()) {
			query = query.ilike("description", `%${data.search.trim()}%`)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

export const fetchPurchaseItemFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("purchase_item")
			.select(
				"*, purchase_item_ingredient(id, ingredient_id, conversion_factor, conversion_notes, is_default, ingredient:ingredient_id(id, description, measure_unit))"
			)
			.eq("id", data.id)
			.is("deleted_at", null)
			.single()

		if (error) throw new Error(error.message)
		return result
	})

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createPurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: PurchaseItemWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient().from("purchase_item").insert(data.payload).select().single()

		if (error) throw new Error(`Falha ao criar item de compra [${error.code}]: ${error.message}`)
		return result
	})

export const updatePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid(), payload: PurchaseItemWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("purchase_item")
			.update({ ...data.payload, updated_at: new Date().toISOString() })
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(`Falha ao atualizar item de compra [${error.code}]: ${error.message}`)
		return result
	})

export const deletePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("purchase_item").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export const fetchPurchaseItemIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ purchaseItemId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("purchase_item_ingredient")
			.select("*, ingredient:ingredient_id(id, description, measure_unit)")
			.eq("purchase_item_id", data.purchaseItemId)

		if (error) throw new Error(error.message)
		return result || []
	})

export const upsertPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: PurchaseItemIngredientWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("purchase_item_ingredient")
			.upsert(data.payload, { onConflict: "purchase_item_id,ingredient_id" })
			.select()
			.single()

		if (error) throw new Error(`Falha ao vincular ingrediente [${error.code}]: ${error.message}`)
		return result
	})

export const deletePurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("purchase_item_ingredient").delete().eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const setDefaultPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid(), purchaseItemId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		// Clear existing defaults for this purchase_item, then set the new one
		await supabase.from("purchase_item_ingredient").update({ is_default: false }).eq("purchase_item_id", data.purchaseItemId)
		const { error } = await supabase.from("purchase_item_ingredient").update({ is_default: true }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})
