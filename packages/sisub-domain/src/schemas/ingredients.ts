import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Escopo do grupo legado "Preparações" (SISUBWEB) dentro do catálogo de insumos.
 * Omitido ⇒ `exclude`: quem pede insumo recebe insumo. Ver `preparation-scope.ts`.
 */
export const PreparationScopeSchema = z.enum(["exclude", "only", "include"])

/**
 * Escopo de catálogo: gêneros de alimentação × itens auxiliares (EPI, limpeza,
 * embalagem…). Omitido ⇒ `include`, tudo junto — o recorte serve às abas de
 * /global/ingredients, não ao seletor da ficha técnica. Ver `catalog-scope.ts`.
 */
export const CatalogScopeSchema = z.enum(["include", "exclude", "only"])

export const ListFoldersSchema = z.object({
	includeDeleted: z.boolean().optional(),
	catalog: CatalogScopeSchema.optional(),
})
export type ListFolders = z.infer<typeof ListFoldersSchema>

/** Grupos das preparações do SISUBWEB — tabela própria, fora de `kitchen.folder`. */
export const ListPreparationGroupsSchema = z.object({
	includeDeleted: z.boolean().optional(),
})
export type ListPreparationGroups = z.infer<typeof ListPreparationGroupsSchema>

export const RestoreFolderSchema = z.object({ id: UuidSchema })
export type RestoreFolder = z.infer<typeof RestoreFolderSchema>

export const CreateFolderSchema = z.object({
	description: z.string().nullable().optional(),
	parentId: UuidSchema.nullable().optional(),
	/**
	 * Escopo da pasta. Só é lido quando a pasta é RAIZ: com pai, o trigger
	 * `folder_inherit_catalog_scope` herda o escopo dele e ignora o que vier daqui —
	 * uma subpasta de EPI classificada como alimentação seria um item na aba errada.
	 */
	catalogScope: z.enum(["alimentacao", "auxiliar"]).optional(),
})
export type CreateFolder = z.infer<typeof CreateFolderSchema>

export const UpdateFolderSchema = CreateFolderSchema.extend({ id: UuidSchema })
export type UpdateFolder = z.infer<typeof UpdateFolderSchema>

export const DeleteFolderSchema = z.object({ id: UuidSchema })
export type DeleteFolder = z.infer<typeof DeleteFolderSchema>

export const ListIngredientsSchema = z.object({
	folderId: UuidSchema.optional(),
	includeDeleted: z.boolean().optional(),
	preparations: PreparationScopeSchema.optional(),
	catalog: CatalogScopeSchema.optional(),
	/** Busca parcial na descrição, sem distinguir caixa. Limitada para não virar um LIKE gigante. */
	search: z.string().trim().min(1).max(200).optional(),
})
export type ListIngredients = z.infer<typeof ListIngredientsSchema>

export const FetchIngredientSchema = z.object({ id: UuidSchema })
export type FetchIngredient = z.infer<typeof FetchIngredientSchema>

export const CreateIngredientSchema = z.object({
	description: z.string().min(1),
	folderId: UuidSchema.nullable().optional(),
	measureUnit: z.string().nullable().optional(),
	correctionFactor: z.number().nullable().optional(),
	ceafaId: UuidSchema.nullable().optional(),
})
export type CreateIngredient = z.infer<typeof CreateIngredientSchema>

export const UpdateIngredientSchema = CreateIngredientSchema.extend({ id: UuidSchema })
export type UpdateIngredient = z.infer<typeof UpdateIngredientSchema>

export const DeleteIngredientSchema = z.object({ id: UuidSchema })
export type DeleteIngredient = z.infer<typeof DeleteIngredientSchema>

export const RestoreIngredientSchema = z.object({ id: UuidSchema })
export type RestoreIngredient = z.infer<typeof RestoreIngredientSchema>

export const ListIngredientItemsSchema = z.object({
	ingredientId: UuidSchema.optional(),
})
export type ListIngredientItems = z.infer<typeof ListIngredientItemsSchema>

export const CreateIngredientItemSchema = z.object({
	ingredientId: UuidSchema.nullable().optional(),
	description: z.string().nullable().optional(),
	barcode: z.string().nullable().optional(),
	purchaseMeasureUnit: z.string().nullable().optional(),
	unitContentQuantity: z.number().nullable().optional(),
	correctionFactor: z.number().nullable().optional(),
	purchaseItemId: UuidSchema.nullable().optional(),
})
export type CreateIngredientItem = z.infer<typeof CreateIngredientItemSchema>

export const UpdateIngredientItemSchema = CreateIngredientItemSchema.extend({ id: UuidSchema })
export type UpdateIngredientItem = z.infer<typeof UpdateIngredientItemSchema>

export const DeleteIngredientItemSchema = z.object({ id: UuidSchema })
export type DeleteIngredientItem = z.infer<typeof DeleteIngredientItemSchema>

export const FetchIngredientNutrientsSchema = z.object({ ingredientId: UuidSchema })
export type FetchIngredientNutrients = z.infer<typeof FetchIngredientNutrientsSchema>

export const FetchIngredientEffectiveNutrientsSchema = z.object({ ingredientId: UuidSchema })
export type FetchIngredientEffectiveNutrients = z.infer<typeof FetchIngredientEffectiveNutrientsSchema>

export const SetIngredientNutrientsSchema = z.object({
	ingredientId: UuidSchema,
	nutrients: z.array(
		z.object({
			nutrientId: UuidSchema,
			nutrientValue: z.number().nullable(),
		})
	),
})
export type SetIngredientNutrients = z.infer<typeof SetIngredientNutrientsSchema>

// ── Versionamento (histórico de alterações do insumo) ────────────────────────

/** Identidade do autor da alteração, resolvida na camada server (auth). */
export const VersionActorSchema = z.object({
	id: UuidSchema.nullable().optional(),
	name: z.string().nullable().optional(),
})
export type VersionActor = z.infer<typeof VersionActorSchema>

export const RecordIngredientVersionSchema = z.object({
	ingredientId: UuidSchema,
	changeSummary: z.string().nullable().optional(),
})
export type RecordIngredientVersion = z.infer<typeof RecordIngredientVersionSchema>

export const ListIngredientVersionsSchema = z.object({ ingredientId: UuidSchema })
export type ListIngredientVersions = z.infer<typeof ListIngredientVersionsSchema>

export const RestoreIngredientVersionSchema = z.object({
	ingredientId: UuidSchema,
	versionId: UuidSchema,
})
export type RestoreIngredientVersion = z.infer<typeof RestoreIngredientVersionSchema>

// ── Revisão de insumos (conferência pelos nutricionistas) ────────────────────

export const RecordIngredientReviewSchema = z.object({
	ingredientId: UuidSchema,
	note: z.string().nullable().optional(),
})
export type RecordIngredientReview = z.infer<typeof RecordIngredientReviewSchema>

/** Última revisão por insumo. Sem ingredientId → todas (árvore); com → 1 insumo (detalhe). */
export const ListIngredientLastReviewsSchema = z.object({
	ingredientId: UuidSchema.optional(),
})
export type ListIngredientLastReviews = z.infer<typeof ListIngredientLastReviewsSchema>

export const ListCeafaSchema = z.object({ search: z.string().optional() })
export type ListCeafa = z.infer<typeof ListCeafaSchema>

export const ListCatmatSchema = z.object({ search: z.string() })
export type ListCatmat = z.infer<typeof ListCatmatSchema>

export const ListNutritionReferenceFoodsSchema = z.object({
	search: z.string(),
	sourceId: z.string().optional(),
})
export type ListNutritionReferenceFoods = z.infer<typeof ListNutritionReferenceFoodsSchema>

export const SetIngredientNutritionReferenceSchema = z.object({
	ingredientId: UuidSchema,
	foodRevisionId: UuidSchema.nullable(),
	matchStatus: z.enum(["manual", "suggested", "reviewed"]).optional(),
	notes: z.string().nullable().optional(),
})
export type SetIngredientNutritionReference = z.infer<typeof SetIngredientNutritionReferenceSchema>

// Substituição NÃO mora mais aqui: voltou a ser decisão da linha da ficha técnica
// (`RecipeIngredientAlternativeSchema` em schemas/recipes.ts). O par global insumo →
// substituto não tinha onde guardar a gramatura da substituta, que é justamente o que
// muda de uma preparação para outra. Ver a migration 20260818140000.
