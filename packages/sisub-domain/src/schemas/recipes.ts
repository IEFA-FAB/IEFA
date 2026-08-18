import { z } from "zod"
import { EditScopeSchema, KitchenIdSchema, UuidSchema } from "./common.ts"

export const FetchRecipeSchema = z.object({
	recipeId: UuidSchema,
})
export type FetchRecipe = z.infer<typeof FetchRecipeSchema>

export const ListRecipesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
	search: z.string().max(200).optional(),
	globalOnly: z.boolean().optional(),
	/** Quando true, inclui receitas com soft delete (deleted_at) na listagem. */
	includeDeleted: z.boolean().optional(),
})
export type ListRecipes = z.infer<typeof ListRecipesSchema>

export const ListRecipeVersionsSchema = z.object({
	recipeId: UuidSchema,
})
export type ListRecipeVersions = z.infer<typeof ListRecipeVersionsSchema>

export const DeleteRecipeSchema = z.object({ id: UuidSchema })
export type DeleteRecipe = z.infer<typeof DeleteRecipeSchema>

export const RestoreRecipeSchema = z.object({ id: UuidSchema })
export type RestoreRecipe = z.infer<typeof RestoreRecipeSchema>

/** Renomeia uma receita in-place (usado por localizar e substituir em massa). */
export const RenameRecipeSchema = z.object({ id: UuidSchema, name: z.string().min(1).max(200) })
export type RenameRecipe = z.infer<typeof RenameRecipeSchema>

// ── Pastas de preparação (agrupamento plano — organização e filtragem) ───────

export const ListRecipeFoldersSchema = z.object({
	/** Quando true, inclui pastas com soft delete. Default: só as ativas. */
	includeDeleted: z.boolean().optional(),
})
export type ListRecipeFolders = z.infer<typeof ListRecipeFoldersSchema>

export const CreateRecipeFolderSchema = z.object({ name: z.string().trim().min(1).max(120) })
export type CreateRecipeFolder = z.infer<typeof CreateRecipeFolderSchema>

export const RenameRecipeFolderSchema = CreateRecipeFolderSchema.extend({ id: UuidSchema })
export type RenameRecipeFolder = z.infer<typeof RenameRecipeFolderSchema>

export const DeleteRecipeFolderSchema = z.object({ id: UuidSchema })
export type DeleteRecipeFolder = z.infer<typeof DeleteRecipeFolderSchema>

/**
 * Arquiva preparações numa pasta (ou as tira de qualquer pasta, com `folderId: null`).
 * Aceita várias de uma vez porque a ação natural na listagem é em lote.
 */
export const SetRecipeFolderSchema = z.object({
	recipeIds: z.array(UuidSchema).min(1).max(500),
	folderId: UuidSchema.nullable(),
})
export type SetRecipeFolder = z.infer<typeof SetRecipeFolderSchema>

/**
 * Substituto de UMA linha da ficha técnica.
 *
 * A quantidade é ABSOLUTA, não um fator: é o motivo de a substituição ter voltado da
 * tabela global (`kitchen.ingredient_substitution`, aposentada em 2026-08-18) para a
 * linha. 2 kg de biscoito champagne viram 1,6 kg de amanteigado nesta preparação, e o
 * par global não tinha onde guardar esse "nesta preparação".
 */
export const RecipeIngredientAlternativeSchema = z.object({
	ingredientId: UuidSchema,
	netQuantity: z.number().positive(),
	priorityOrder: z.number().int().nonnegative(),
})
export type RecipeIngredientAlternative = z.infer<typeof RecipeIngredientAlternativeSchema>

export const IngredientSchema = z.object({
	ingredientId: UuidSchema,
	netQuantity: z.number().positive(),
	isOptional: z.boolean(),
	priorityOrder: z.number().int().nonnegative(),
	/**
	 * Fator de Correção específico desta preparação (peso bruto / peso líquido).
	 * Opcional: null/omitido = herda o insumo e, na ausência, vale 1 (não altera).
	 */
	correctionFactor: z.number().positive().nullable().optional(),
	/**
	 * Índice de reidratação específico desta preparação (peso reidratado / peso seco).
	 * Opcional: null/omitido = herda o insumo e, na ausência, vale 1 (não altera).
	 */
	rehydrationIndex: z.number().positive().nullable().optional(),
	/**
	 * Substitutos desta linha. Omitido ⇒ nenhum. Viajam JUNTO com a linha no salvamento
	 * (não numa chamada própria) porque `saveRecipeEdit` insere linhas novas a cada
	 * versão: gravar as substituições em separado as prenderia à versão anterior, e a
	 * ficha nasceria sem elas na versão que o usuário acabou de salvar.
	 */
	alternatives: z.array(RecipeIngredientAlternativeSchema).optional(),
})
export type Ingredient = z.infer<typeof IngredientSchema>

export const CreateRecipeSchema = z.object({
	name: z.string().min(1),
	preparationMethod: z.string().optional(),
	portionYield: z.number().positive(),
	preparationTimeMinutes: z.number().int().nonnegative().optional(),
	cookingFactor: z.number().positive().optional(),
	rationalId: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	/**
	 * Pasta de organização (kitchen.recipe_folder) — metadado de agrupamento, não faz parte
	 * da ficha técnica. Em `saveRecipeEdit`, omitir preserva a pasta da versão base; `null`
	 * explícito tira a preparação de qualquer pasta.
	 */
	folderId: UuidSchema.nullable().optional(),
	ingredients: z.array(IngredientSchema).optional(),
})
export type CreateRecipe = z.infer<typeof CreateRecipeSchema>

/**
 * Salvar a edição de uma receita existente.
 *
 * Sem `version` e sem `kitchenId`: ambos são resolvidos no servidor. O número de versão
 * vinha do cliente e, como a listagem deduplica por família mantendo a maior versão,
 * bastava enviar um número alto para fixar a própria linha como canônica. O escopo vinha
 * do dado carregado, o que fazia a edição de uma receita global no contexto de uma
 * cozinha virar uma nova versão global.
 */
export const SaveRecipeEditSchema = CreateRecipeSchema.omit({ kitchenId: true }).extend({
	/** Versão que o usuário abriu para editar. A raiz da linhagem é resolvida no servidor. */
	baseRecipeId: UuidSchema,
	context: EditScopeSchema,
})
export type SaveRecipeEdit = z.infer<typeof SaveRecipeEditSchema>

// ── Revisão de preparações (conferência pelos nutricionistas) ────────────────

export const RecordRecipeReviewSchema = z.object({
	recipeId: UuidSchema,
	note: z.string().nullable().optional(),
})
export type RecordRecipeReview = z.infer<typeof RecordRecipeReviewSchema>

/** Última revisão por preparação. Sem recipeId → todas; com → 1 preparação (detalhe). */
export const ListRecipeLastReviewsSchema = z.object({
	recipeId: UuidSchema.optional(),
})
export type ListRecipeLastReviews = z.infer<typeof ListRecipeLastReviewsSchema>
