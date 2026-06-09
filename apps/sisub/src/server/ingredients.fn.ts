/**
 * @module ingredients.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
	CreateFolderSchema,
	CreateIngredientItemSchema,
	CreateIngredientSchema,
	createFolder,
	createIngredient,
	createIngredientItem,
	DeleteFolderSchema,
	DeleteIngredientItemSchema,
	DeleteIngredientSchema,
	deleteFolder,
	deleteIngredient,
	deleteIngredientItem,
	FetchIngredientNutrientsSchema,
	FetchIngredientSchema,
	fetchIngredient,
	ListCatmatSchema,
	ListCeafaSchema,
	ListFoldersSchema,
	ListIngredientItemsSchema,
	ListIngredientsSchema,
	ListIngredientVersionsSchema,
	listCatmatItems,
	listCeafa,
	listFolders,
	listIngredientItems,
	listIngredientNutrients,
	listIngredients,
	listIngredientVersions,
	listNutrients,
	RecordIngredientVersionSchema,
	RestoreFolderSchema,
	RestoreIngredientSchema,
	RestoreIngredientVersionSchema,
	recordIngredientVersion,
	restoreFolder,
	restoreIngredient,
	restoreIngredientVersion,
	SetIngredientNutrientsSchema,
	setIngredientNutrients,
	UpdateFolderSchema,
	UpdateIngredientItemSchema,
	UpdateIngredientSchema,
	updateFolder,
	updateIngredient,
	updateIngredientItem,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"

/** Resolve a identidade legível do autor da alteração a partir da sessão. */
async function resolveActor(): Promise<{ id: string | null; name: string | null }> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) return { id: null, name: null }
	const meta = (user.user_metadata ?? {}) as Record<string, unknown>
	const name = (meta.full_name as string) ?? (meta.name as string) ?? (meta.display_name as string) ?? user.email ?? null
	return { id: user.id, name }
}

export const fetchNutrientsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listNutrients(getSupabaseServerClient(), ctx).catch(handleDomainError)
})

export const fetchIngredientNutrientsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchIngredientNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientNutrients(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const setIngredientNutrientsFn = createServerFn({ method: "POST" })
	.inputValidator(SetIngredientNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setIngredientNutrients(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchCeafaFn = createServerFn({ method: "GET" })
	.inputValidator(ListCeafaSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listCeafa(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchCatmatItemsFn = createServerFn({ method: "GET" })
	.inputValidator(ListCatmatSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listCatmatItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchFoldersFn = createServerFn({ method: "GET" })
	.inputValidator(ListFoldersSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listFolders(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createFolderFn = createServerFn({ method: "POST" })
	.inputValidator(CreateFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createFolder(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateFolderFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateFolder(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteFolderFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteFolder(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreFolderFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreFolder(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientFn = createServerFn({ method: "GET" })
	.inputValidator(FetchIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(ListIngredientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredients(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(CreateIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientItemsFn = createServerFn({ method: "GET" })
	.inputValidator(ListIngredientItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(CreateIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createIngredientItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateIngredientItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteIngredientItemFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteIngredientItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ── Versionamento (histórico de alterações do insumo) ─────────────────────────

/**
 * Salva identificação + nutrientes do insumo e registra UMA versão do agregado.
 * Coalesce as duas escritas (metadata + nutrientes) num único snapshot.
 */
const SaveIngredientDetailsSchema = UpdateIngredientSchema.extend({
	nutrients: z.array(z.object({ nutrientId: z.string().uuid(), nutrientValue: z.number().nullable() })),
})

export const saveIngredientDetailsFn = createServerFn({ method: "POST" })
	.inputValidator(SaveIngredientDetailsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const client = getSupabaseServerClient()
		const { nutrients, ...ingredient } = data
		await updateIngredient(client, ctx, ingredient).catch(handleDomainError)
		await setIngredientNutrients(client, ctx, { ingredientId: data.id, nutrients }).catch(handleDomainError)
		const actor = await resolveActor()
		return recordIngredientVersion(client, ctx, { ingredientId: data.id }, actor).catch(handleDomainError)
	})

export const recordIngredientVersionFn = createServerFn({ method: "POST" })
	.inputValidator(RecordIngredientVersionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const actor = await resolveActor()
		return recordIngredientVersion(getSupabaseServerClient(), ctx, data, actor).catch(handleDomainError)
	})

export const fetchIngredientVersionsFn = createServerFn({ method: "GET" })
	.inputValidator(ListIngredientVersionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientVersions(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreIngredientVersionFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreIngredientVersionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const actor = await resolveActor()
		return restoreIngredientVersion(getSupabaseServerClient(), ctx, data, actor).catch(handleDomainError)
	})
