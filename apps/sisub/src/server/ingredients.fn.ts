import type { FolderInsert, FolderUpdate, IngredientInsert, IngredientItemInsert, IngredientItemUpdate, IngredientUpdate } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const fetchNutrientsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("nutrient").select("*").is("deleted_at", null).order("display_order", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

export const fetchIngredientNutrientsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ ingredientId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("ingredient_nutrient")
			.select("*, nutrient(*)")
			.eq("ingredient_id", data.ingredientId)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)
		return result || []
	})

export const setIngredientNutrientsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			ingredientId: z.string(),
			nutrients: z.array(z.object({ nutrient_id: z.string(), nutrient_value: z.number().nullable() })),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		const { error: delError } = await supabase
			.from("ingredient_nutrient")
			.update({ deleted_at: new Date().toISOString() })
			.eq("ingredient_id", data.ingredientId)
			.is("deleted_at", null)

		if (delError) throw new Error(delError.message)

		const toInsert = data.nutrients
			.filter((n) => n.nutrient_value != null)
			.map((n) => ({ ingredient_id: data.ingredientId, nutrient_id: n.nutrient_id, nutrient_value: n.nutrient_value }))

		if (toInsert.length > 0) {
			const { error: insError } = await supabase.from("ingredient_nutrient").insert(toInsert)
			if (insError) throw new Error(insError.message)
		}
	})

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
			query = query.eq("codigo_item", parseInt(term, 10))
		} else {
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

const IngredientWriteSchema = z.object({
	description: z.string().nullable().optional(),
	folder_id: z.string().nullable().optional(),
	measure_unit: z.string().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
	ceafa_id: z.string().nullable().optional(),
	catmat_item_codigo: z.number().nullable().optional(),
	catmat_item_descricao: z.string().nullable().optional(),
})

const IngredientItemWriteSchema = z.object({
	ingredient_id: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	barcode: z.string().nullable().optional(),
	purchase_measure_unit: z.string().nullable().optional(),
	unit_content_quantity: z.number().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
})

export const fetchFoldersFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("folder").select("*").is("deleted_at", null).order("created_at", { ascending: true })

	if (error) throw new Error(error.message)
	return data || []
})

export const createFolderFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: FolderWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
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
		await requireAuth()
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
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("folder").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const fetchIngredientFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().from("ingredient").select("*").eq("id", data.id).is("deleted_at", null).single()

		if (error) throw new Error(error.message)
		return result
	})

export const fetchIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ folderId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("ingredient").select("*").is("deleted_at", null).order("description", { ascending: true })

		if (data.folderId) {
			query = query.eq("folder_id", data.folderId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

export const createIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: IngredientWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("ingredient")
			.insert(data.payload as IngredientInsert)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

export const updateIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), payload: IngredientWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("ingredient")
			.update(data.payload as IngredientUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

export const deleteIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("ingredient").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})

export const fetchIngredientItemsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ ingredientId: z.string().optional() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("ingredient_item").select("*").is("deleted_at", null).order("description", { ascending: true })

		if (data.ingredientId) {
			query = query.eq("ingredient_id", data.ingredientId)
		}

		const { data: result, error } = await query
		if (error) throw new Error(error.message)
		return result || []
	})

export const createIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ payload: IngredientItemWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("ingredient_item")
			.insert(data.payload as IngredientItemInsert)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

export const updateIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), payload: IngredientItemWriteSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { data: result, error } = await getSupabaseServerClient()
			.from("ingredient_item")
			.update(data.payload as IngredientItemUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(error.message)
		return result
	})

export const deleteIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("ingredient_item").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(error.message)
	})
