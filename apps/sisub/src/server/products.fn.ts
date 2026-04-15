/**
 * @module products.fn
 * Global product catalogue CRUD: nutrients, CEAFA, CATMAT lookup, folders, products and product items.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: nutrient, product_nutrient, ceafa, compras_material_item, folder, product, product_item (all soft-delete via deleted_at).
 */

import type { FolderInsert, FolderUpdate, ProductInsert, ProductItemInsert, ProductItemUpdate, ProductUpdate } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ============================================================================
// Nutrients
// ============================================================================

/**
 * Lists all active nutrients ordered by display_order.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchNutrientsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("nutrient").select("*").is("deleted_at", null).order("display_order", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

/**
 * Lists active nutrient values for a product with the nutrient definition joined.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchProductNutrientsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ productId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product_nutrient")
			.select("*, nutrient(*)")
			.eq("product_id", data.productId)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)
		return result || []
	})

/**
 * Replaces all nutrient values for a product: soft-deletes existing records then inserts non-null values.
 *
 * @remarks
 * SIDE EFFECTS: soft-deletes all active product_nutrient rows for the product, then inserts new rows for nutrient_value != null.
 * Null-valued nutrients are not inserted (intent: "not measured"). Two-step, no transaction.
 *
 * @throws {Error} on soft-delete or insert failure.
 */
export const setProductNutrientsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			productId: z.string(),
			nutrients: z.array(z.object({ nutrient_id: z.string(), nutrient_value: z.number().nullable() })),
		})
	)
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		// Soft-delete all existing records
		const { error: delError } = await supabase
			.from("product_nutrient")
			.update({ deleted_at: new Date().toISOString() })
			.eq("product_id", data.productId)
			.is("deleted_at", null)

		if (delError) throw new Error(delError.message)

		// Insert non-null values
		const toInsert = data.nutrients
			.filter((n) => n.nutrient_value != null)
			.map((n) => ({ product_id: data.productId, nutrient_id: n.nutrient_id, nutrient_value: n.nutrient_value }))

		if (toInsert.length > 0) {
			const { error: insError } = await supabase.from("product_nutrient").insert(toInsert)
			if (insError) throw new Error(insError.message)
		}
	})

// ============================================================================
// CEAFA
// ============================================================================

/**
 * Lists up to 50 CEAFA items ordered by description, optionally filtered by description search (ilike, trimmed).
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchCeafaFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ search: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("ceafa").select("*").order("description", { ascending: true }).limit(50)

		if (data.search && data.search.trim().length > 0) {
			query = query.ilike("description", `%${data.search.trim()}%`)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

// ============================================================================
// CATMAT (Catálogo de Materiais — Compras.gov.br)
// ============================================================================

/**
 * Searches CATMAT items (Compras.gov.br material catalogue) by code or description. Returns [] for terms under 2 chars.
 *
 * @remarks
 * Numeric term → exact codigo_item match; text → ilike on descricao_item (GIN trigram index expected for performance).
 * Limit: 40 active items ordered by descricao_item.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchCatmatItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ search: z.string() }))
	.handler(async ({ data }) => {
		const term = data.search.trim()
		if (term.length < 2) return []

		const isNumericCode = /^\d+$/.test(term)

		let query = getSupabaseServerClient()
			.from("compras_material_item")
			.select("codigo_item, descricao_item, item_sustentavel")
			.eq("status_item", true)
			.limit(40)
			.order("descricao_item", { ascending: true })

		if (isNumericCode) {
			// Exact code lookup — user typed a number
			query = query.eq("codigo_item", parseInt(term, 10))
		} else {
			// Description search — relies on GIN trigram index for performance
			query = query.ilike("descricao_item", `%${term}%`)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result ?? []
	})

const FolderWriteSchema = z.object({
	description: z.string().nullable().optional(),
	parent_id: z.string().nullable().optional(),
})

const ProductWriteSchema = z.object({
	description: z.string().nullable().optional(),
	folder_id: z.string().nullable().optional(),
	measure_unit: z.string().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
	ceafa_id: z.string().nullable().optional(),
	catmat_item_codigo: z.number().nullable().optional(),
	catmat_item_descricao: z.string().nullable().optional(),
})

const ProductItemWriteSchema = z.object({
	product_id: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	barcode: z.string().nullable().optional(),
	purchase_measure_unit: z.string().nullable().optional(),
	unit_content_quantity: z.number().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
})

// ============================================================================
// Folders
// ============================================================================

/**
 * Lists all active folders ordered by created_at ascending.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchFoldersFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("folder").select("*").is("deleted_at", null).order("created_at", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

/**
 * Creates a product folder, optionally nested under a parent_id.
 *
 * @remarks
 * SIDE EFFECTS: inserts into folder.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const createFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: FolderWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("folder")
			.insert(data.payload as FolderInsert)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Updates a folder's description or parent_id.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), payload: FolderWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("folder")
			.update(data.payload as FolderUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Soft-deletes a folder by setting deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("folder").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Products
// ============================================================================

/**
 * Fetches a single active product by id.
 *
 * @throws {Error} on Supabase query failure or not found (via .single()).
 */
export const fetchProductFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("product").select("*").eq("id", data.id).is("deleted_at", null).single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Lists active products ordered by description, optionally filtered by folderId.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchProductsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ folderId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("product").select("*").is("deleted_at", null).order("description", { ascending: true })

		if (data.folderId) {
			query = query.eq("folder_id", data.folderId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

/**
 * Creates a product with optional CATMAT and CEAFA linkage.
 *
 * @remarks
 * SIDE EFFECTS: inserts into product.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const createProductFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: ProductWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product")
			.insert(data.payload as ProductInsert)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Updates a product's description, folder, measure_unit, correction_factor or CATMAT linkage.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateProductFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), payload: ProductWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product")
			.update(data.payload as ProductUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Soft-deletes a product by setting deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteProductFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("product").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Product Items
// ============================================================================

/**
 * Lists active product_items ordered by description, optionally filtered by productId.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchProductItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ productId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("product_item").select("*").is("deleted_at", null).order("description", { ascending: true })

		if (data.productId) {
			query = query.eq("product_id", data.productId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

/**
 * Creates a product_item (purchasable SKU) linked to a product.
 *
 * @remarks
 * SIDE EFFECTS: inserts into product_item.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const createProductItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: ProductItemWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product_item")
			.insert(data.payload as ProductItemInsert)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Updates a product_item's description, barcode, purchase unit or correction factor.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateProductItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), payload: ProductItemWriteSchema }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product_item")
			.update(data.payload as ProductItemUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Soft-deletes a product_item by setting deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteProductItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("product_item").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})
