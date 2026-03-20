import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { FolderInsert, FolderUpdate, ProductInsert, ProductItemInsert, ProductItemUpdate, ProductUpdate } from "@/types/supabase.types"

// ============================================================================
// Nutrients
// ============================================================================

export const fetchNutrientsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient()
		.from("nutrient")
		.select("*")
		.is("deleted_at", null)
		.order("display_order", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

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

export const setProductNutrientsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			productId: z.string(),
			nutrients: z.array(z.object({ nutrient_id: z.string(), nutrient_value: z.number().nullable() })),
		}),
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
		const toInsert = data.nutrients.filter((n) => n.nutrient_value != null).map((n) => ({ product_id: data.productId, nutrient_id: n.nutrient_id, nutrient_value: n.nutrient_value }))

		if (toInsert.length > 0) {
			const { error: insError } = await supabase.from("product_nutrient").insert(toInsert)
			if (insError) throw new Error(insError.message)
		}
	})

// ============================================================================
// CEAFA
// ============================================================================

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

const FolderWriteSchema = z.object({
	description: z.string().nullable().optional(),
	parent_id: z.string().nullable().optional(),
})

const ProductWriteSchema = z.object({
	description: z.string().nullable().optional(),
	folder_id: z.string().nullable().optional(),
	measure_unit: z.string().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
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

export const fetchFoldersFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("folder").select("*").is("deleted_at", null).order("created_at", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

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

export const deleteFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("folder").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Products
// ============================================================================

export const fetchProductFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("product").select("*").eq("id", data.id).is("deleted_at", null).single()

		if (error) throw new Error(error.message)
		return result
	})

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

export const deleteProductFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("product").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Product Items
// ============================================================================

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

export const deleteProductItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("product_item").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})
