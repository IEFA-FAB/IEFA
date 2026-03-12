import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type {
	FolderInsert,
	FolderUpdate,
	ProductInsert,
	ProductItemInsert,
	ProductItemUpdate,
	ProductUpdate,
} from "@/types/supabase.types"

// ============================================================================
// Folders
// ============================================================================

export const fetchFoldersFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient()
		.from("folder")
		.select("*")
		.is("deleted_at", null)
		.order("created_at", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

export const createFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: z.record(z.unknown()) }))
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
	.inputValidator(z.object({ id: z.string(), payload: z.record(z.unknown()) }))
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
		const { error } = await getSupabaseServerClient()
			.from("folder")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Products
// ============================================================================

export const fetchProductFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("product")
			.select("*")
			.eq("id", data.id)
			.is("deleted_at", null)
			.single()

		if (error) throw new Error(error.message)
		return result
	})

export const fetchProductsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ folderId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient()
			.from("product")
			.select("*")
			.is("deleted_at", null)
			.order("description", { ascending: true })

		if (data.folderId) {
			query = query.eq("folder_id", data.folderId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

export const createProductFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: z.record(z.unknown()) }))
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
	.inputValidator(z.object({ id: z.string(), payload: z.record(z.unknown()) }))
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
		const { error } = await getSupabaseServerClient()
			.from("product")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Product Items
// ============================================================================

export const fetchProductItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ productId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient()
			.from("product_item")
			.select("*")
			.is("deleted_at", null)
			.order("description", { ascending: true })

		if (data.productId) {
			query = query.eq("product_id", data.productId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

export const createProductItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: z.record(z.unknown()) }))
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
	.inputValidator(z.object({ id: z.string(), payload: z.record(z.unknown()) }))
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
		const { error } = await getSupabaseServerClient()
			.from("product_item")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(error.message)
	})
