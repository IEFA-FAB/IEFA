import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type {
	CreateFolder,
	CreateIngredient,
	CreateIngredientItem,
	DeleteFolder,
	DeleteIngredient,
	DeleteIngredientItem,
	FetchIngredient,
	FetchIngredientNutrients,
	ListCatmat,
	ListCeafa,
	ListIngredientItems,
	ListIngredients,
	SetIngredientNutrients,
	UpdateFolder,
	UpdateIngredient,
	UpdateIngredientItem,
} from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function listFolders(client: AnyClient, ctx: UserContext) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("folder").select("*").is("deleted_at", null).order("created_at", { ascending: true })
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function createFolder(client: AnyClient, ctx: UserContext, input: CreateFolder) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("folder").insert({ description: input.description, parent_id: input.parentId }).select().single()
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function updateFolder(client: AnyClient, ctx: UserContext, input: UpdateFolder) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("folder").update({ description: input.description, parent_id: input.parentId }).eq("id", input.id).select().single()
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function deleteFolder(client: AnyClient, ctx: UserContext, input: DeleteFolder) {
	requirePermission(ctx, "kitchen", 1)
	const { error } = await client.from("folder").update({ deleted_at: new Date().toISOString() }).eq("id", input.id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function listIngredients(client: AnyClient, ctx: UserContext, input: ListIngredients) {
	requirePermission(ctx, "kitchen", 1)
	let query = client.from("ingredient").select("*").is("deleted_at", null).order("description", { ascending: true })
	if (input.folderId) query = query.eq("folder_id", input.folderId)
	const { data, error } = await query
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function fetchIngredient(client: AnyClient, ctx: UserContext, input: FetchIngredient) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("ingredient").select("*").eq("id", input.id).is("deleted_at", null).single()
	if (error || !data) throw new NotFoundError("ingredient", input.id)
	return data
}

export async function createIngredient(client: AnyClient, ctx: UserContext, input: CreateIngredient) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client
		.from("ingredient")
		.insert({
			description: input.description,
			folder_id: input.folderId,
			measure_unit: input.measureUnit,
			correction_factor: input.correctionFactor,
			ceafa_id: input.ceafaId,
		})
		.select()
		.single()
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function updateIngredient(client: AnyClient, ctx: UserContext, input: UpdateIngredient) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client
		.from("ingredient")
		.update({
			description: input.description,
			folder_id: input.folderId,
			measure_unit: input.measureUnit,
			correction_factor: input.correctionFactor,
			ceafa_id: input.ceafaId,
		})
		.eq("id", input.id)
		.select()
		.single()
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function deleteIngredient(client: AnyClient, ctx: UserContext, input: DeleteIngredient) {
	requirePermission(ctx, "kitchen", 1)
	const { error } = await client.from("ingredient").update({ deleted_at: new Date().toISOString() }).eq("id", input.id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function listIngredientItems(client: AnyClient, ctx: UserContext, input: ListIngredientItems) {
	requirePermission(ctx, "kitchen", 1)
	let query = client.from("ingredient_item").select("*").is("deleted_at", null).order("description", { ascending: true })
	if (input.ingredientId) query = query.eq("ingredient_id", input.ingredientId)
	const { data, error } = await query
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function createIngredientItem(client: AnyClient, ctx: UserContext, input: CreateIngredientItem) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client
		.from("ingredient_item")
		.insert({
			ingredient_id: input.ingredientId,
			description: input.description,
			barcode: input.barcode,
			purchase_measure_unit: input.purchaseMeasureUnit,
			unit_content_quantity: input.unitContentQuantity,
			correction_factor: input.correctionFactor,
		})
		.select()
		.single()
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data
}

export async function updateIngredientItem(client: AnyClient, ctx: UserContext, input: UpdateIngredientItem) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client
		.from("ingredient_item")
		.update({
			ingredient_id: input.ingredientId,
			description: input.description,
			barcode: input.barcode,
			purchase_measure_unit: input.purchaseMeasureUnit,
			unit_content_quantity: input.unitContentQuantity,
			correction_factor: input.correctionFactor,
		})
		.eq("id", input.id)
		.select()
		.single()
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return data
}

export async function deleteIngredientItem(client: AnyClient, ctx: UserContext, input: DeleteIngredientItem) {
	requirePermission(ctx, "kitchen", 1)
	const { error } = await client.from("ingredient_item").update({ deleted_at: new Date().toISOString() }).eq("id", input.id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function listNutrients(client: AnyClient, ctx: UserContext) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("nutrient").select("*").is("deleted_at", null).order("display_order", { ascending: true })
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function listIngredientNutrients(client: AnyClient, ctx: UserContext, input: FetchIngredientNutrients) {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client.from("ingredient_nutrient").select("*, nutrient(*)").eq("ingredient_id", input.ingredientId).is("deleted_at", null)
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function setIngredientNutrients(client: AnyClient, ctx: UserContext, input: SetIngredientNutrients) {
	requirePermission(ctx, "kitchen", 1)

	const { error: delError } = await client
		.from("ingredient_nutrient")
		.update({ deleted_at: new Date().toISOString() })
		.eq("ingredient_id", input.ingredientId)
		.is("deleted_at", null)
	if (delError) throw new DomainError("UPDATE_FAILED", delError.message)

	const toInsert = input.nutrients
		.filter((n) => n.nutrientValue != null)
		.map((n) => ({ ingredient_id: input.ingredientId, nutrient_id: n.nutrientId, nutrient_value: n.nutrientValue }))

	if (toInsert.length > 0) {
		const { error: insError } = await client.from("ingredient_nutrient").insert(toInsert)
		if (insError) throw new DomainError("INSERT_FAILED", insError.message)
	}
}

export async function listCeafa(client: AnyClient, ctx: UserContext, input: ListCeafa) {
	requirePermission(ctx, "kitchen", 1)
	let query = client.from("ceafa").select("*").order("description", { ascending: true }).limit(50)
	if (input.search?.trim()) query = query.ilike("description", `%${input.search.trim()}%`)
	const { data, error } = await query
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}

export async function listCatmatItems(client: AnyClient, ctx: UserContext, input: ListCatmat) {
	requirePermission(ctx, "kitchen", 1)
	const term = input.search.trim()
	if (term.length < 2) return []

	const isNumericCode = /^\d+$/.test(term)
	let query = client
		.from("compras_material_item")
		.select("codigo_item, descricao_item, item_sustentavel")
		.eq("status_item", true)
		.limit(40)
		.order("descricao_item", { ascending: true })

	if (isNumericCode) {
		query = query.eq("codigo_item", Number.parseInt(term, 10))
	} else {
		query = query.ilike("descricao_item", `%${term}%`)
	}

	const { data, error } = await query
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return data ?? []
}
