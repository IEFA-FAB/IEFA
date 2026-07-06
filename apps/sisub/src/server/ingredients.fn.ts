/**
 * @module ingredients.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * @domain core
 * @migration done
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
	FetchIngredientEffectiveNutrientsSchema,
	FetchIngredientNutrientsSchema,
	FetchIngredientSchema,
	fetchIngredient,
	getIngredientNutritionReference,
	ListCatmatSchema,
	ListCeafaSchema,
	ListFoldersSchema,
	ListIngredientItemsSchema,
	ListIngredientLastReviewsSchema,
	ListIngredientSubstitutionsSchema,
	ListIngredientsSchema,
	ListIngredientVersionsSchema,
	ListNutritionReferenceFoodsSchema,
	listCatmatItems,
	listCeafa,
	listFolders,
	listIngredientEffectiveNutrients,
	listIngredientItems,
	listIngredientLastReviews,
	listIngredientNutrients,
	listIngredientSubstitutions,
	listIngredients,
	listIngredientVersions,
	listNutrients,
	listNutritionReferenceFoods,
	RecordIngredientReviewSchema,
	RecordIngredientVersionSchema,
	RestoreFolderSchema,
	RestoreIngredientSchema,
	RestoreIngredientVersionSchema,
	recordIngredientReview,
	recordIngredientVersion,
	restoreFolder,
	restoreIngredient,
	restoreIngredientVersion,
	SetIngredientNutrientsSchema,
	SetIngredientNutritionReferenceSchema,
	SetIngredientSubstitutionsSchema,
	setIngredientNutrients,
	setIngredientNutritionReference,
	setIngredientSubstitutions,
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
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseAuthClient } from "@/lib/supabase.server"

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
	return listNutrients(getDb(), ctx).catch(handleDomainError)
})

export const fetchIngredientNutrientsFn = createServerFn({ method: "GET" })
	.validator(FetchIngredientNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientNutrients(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientEffectiveNutrientsFn = createServerFn({ method: "GET" })
	.validator(FetchIngredientEffectiveNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientEffectiveNutrients(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientNutritionReferenceFn = createServerFn({ method: "GET" })
	.validator(FetchIngredientNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getIngredientNutritionReference(getDb(), ctx, data).catch(handleDomainError)
	})

export const setIngredientNutrientsFn = createServerFn({ method: "POST" })
	.validator(SetIngredientNutrientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setIngredientNutrients(getDb(), ctx, data).catch(handleDomainError)
	})

export const setIngredientNutritionReferenceFn = createServerFn({ method: "POST" })
	.validator(SetIngredientNutritionReferenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setIngredientNutritionReference(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchCeafaFn = createServerFn({ method: "GET" })
	.validator(ListCeafaSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listCeafa(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchCatmatItemsFn = createServerFn({ method: "GET" })
	.validator(ListCatmatSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listCatmatItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchNutritionReferenceFoodsFn = createServerFn({ method: "GET" })
	.validator(ListNutritionReferenceFoodsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listNutritionReferenceFoods(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchFoldersFn = createServerFn({ method: "GET" })
	.validator(ListFoldersSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listFolders(getDb(), ctx, data).catch(handleDomainError)
	})

export const createFolderFn = createServerFn({ method: "POST" })
	.validator(CreateFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateFolderFn = createServerFn({ method: "POST" })
	.validator(UpdateFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteFolderFn = createServerFn({ method: "POST" })
	.validator(DeleteFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreFolderFn = createServerFn({ method: "POST" })
	.validator(RestoreFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientFn = createServerFn({ method: "GET" })
	.validator(FetchIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientsFn = createServerFn({ method: "GET" })
	.validator(ListIngredientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredients(getDb(), ctx, data).catch(handleDomainError)
	})

export const createIngredientFn = createServerFn({ method: "POST" })
	.validator(CreateIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateIngredientFn = createServerFn({ method: "POST" })
	.validator(UpdateIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteIngredientFn = createServerFn({ method: "POST" })
	.validator(DeleteIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreIngredientFn = createServerFn({ method: "POST" })
	.validator(RestoreIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientItemsFn = createServerFn({ method: "GET" })
	.validator(ListIngredientItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const createIngredientItemFn = createServerFn({ method: "POST" })
	.validator(CreateIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createIngredientItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateIngredientItemFn = createServerFn({ method: "POST" })
	.validator(UpdateIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateIngredientItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteIngredientItemFn = createServerFn({ method: "POST" })
	.validator(DeleteIngredientItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteIngredientItem(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Substituições de insumo (direcionais, vivem no insumo) ────────────────────

export const fetchIngredientSubstitutionsFn = createServerFn({ method: "GET" })
	.validator(ListIngredientSubstitutionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientSubstitutions(getDb(), ctx, data).catch(handleDomainError)
	})

export const setIngredientSubstitutionsFn = createServerFn({ method: "POST" })
	.validator(SetIngredientSubstitutionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setIngredientSubstitutions(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Versionamento (histórico de alterações do insumo) ─────────────────────────

/**
 * Salva identificação + nutrientes do insumo e registra UMA versão do agregado.
 * Coalesce as duas escritas (metadata + nutrientes) num único snapshot.
 */
const SaveIngredientDetailsSchema = UpdateIngredientSchema.extend({
	// Optional: omit to leave manual nutrients untouched (e.g. when linking a table or
	// unlinking without editing). Only present when the user actually edited the values.
	nutrients: z.array(z.object({ nutrientId: z.string().uuid(), nutrientValue: z.number().nullable() })).optional(),
	nutritionReferenceFoodRevisionId: z.string().uuid().nullable().optional(),
})

export const saveIngredientDetailsFn = createServerFn({ method: "POST" })
	.validator(SaveIngredientDetailsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const client = getDb()
		const { nutrients, nutritionReferenceFoodRevisionId, ...ingredient } = data
		await updateIngredient(client, ctx, ingredient).catch(handleDomainError)
		if (nutritionReferenceFoodRevisionId) {
			// Linked to a table: values come from the reference. Manual rows are preserved
			// (not touched) so they reappear if the link is removed later.
			await setIngredientNutritionReference(client, ctx, { ingredientId: data.id, foodRevisionId: nutritionReferenceFoodRevisionId }).catch(handleDomainError)
		} else {
			await setIngredientNutritionReference(client, ctx, { ingredientId: data.id, foodRevisionId: null }).catch(handleDomainError)
			// Only rewrite manual nutrients when the client actually sends them (user edited
			// the table). A plain unlink sends nothing, so the preserved rows stay intact.
			if (nutrients !== undefined) {
				await setIngredientNutrients(client, ctx, { ingredientId: data.id, nutrients }).catch(handleDomainError)
			}
		}
		const actor = await resolveActor()
		return recordIngredientVersion(client, ctx, { ingredientId: data.id }, actor).catch(handleDomainError)
	})

export const recordIngredientVersionFn = createServerFn({ method: "POST" })
	.validator(RecordIngredientVersionSchema)
	.handler(async ({ data }) => {
		const [ctx, actor] = await Promise.all([requireAuth(), resolveActor()])
		return recordIngredientVersion(getDb(), ctx, data, actor).catch(handleDomainError)
	})

export const fetchIngredientVersionsFn = createServerFn({ method: "GET" })
	.validator(ListIngredientVersionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientVersions(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreIngredientVersionFn = createServerFn({ method: "POST" })
	.validator(RestoreIngredientVersionSchema)
	.handler(async ({ data }) => {
		const [ctx, actor] = await Promise.all([requireAuth(), resolveActor()])
		return restoreIngredientVersion(getDb(), ctx, data, actor).catch(handleDomainError)
	})

// ── Revisão (conferência do insumo pelos nutricionistas) ──────────────────────

export const recordIngredientReviewFn = createServerFn({ method: "POST" })
	.validator(RecordIngredientReviewSchema)
	.handler(async ({ data }) => {
		const [ctx, actor] = await Promise.all([requireAuth(), resolveActor()])
		return recordIngredientReview(getDb(), ctx, data, actor).catch(handleDomainError)
	})

export const fetchIngredientLastReviewsFn = createServerFn({ method: "GET" })
	.validator(ListIngredientLastReviewsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listIngredientLastReviews(getDb(), ctx, data).catch(handleDomainError)
	})
