import type {
	Ceafa,
	Folder,
	FolderInsert,
	FolderUpdate,
	Ingredient,
	IngredientInsert,
	IngredientItem,
	IngredientItemInsert,
	IngredientItemUpdate,
	IngredientNutrient,
	IngredientUpdate,
	Nutrient,
	PurchaseItem,
} from "@iefa/database/sisub"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	createFolderFn,
	createIngredientFn,
	createIngredientItemFn,
	deleteFolderFn,
	deleteIngredientFn,
	deleteIngredientItemFn,
	fetchCatmatItemsFn,
	fetchCeafaFn,
	fetchFoldersFn,
	fetchIngredientFn,
	fetchIngredientItemsFn,
	fetchIngredientNutrientsFn,
	fetchIngredientsFn,
	fetchIngredientVersionsFn,
	fetchNutrientsFn,
	recordIngredientVersionFn,
	restoreFolderFn,
	restoreIngredientFn,
	restoreIngredientVersionFn,
	saveIngredientDetailsFn,
	setIngredientNutrientsFn,
	updateFolderFn,
	updateIngredientFn,
	updateIngredientItemFn,
} from "@/server/ingredients.fn"
import {
	createPurchaseItemFn,
	deletePurchaseItemIngredientFn,
	fetchIngredientPurchaseItemsFn,
	updatePurchaseItemFn,
	upsertPurchaseItemIngredientFn,
} from "@/server/purchase_item.fn"
import type { IngredientVersion } from "@/types/domain/ingredient-versions"

/** purchase_item correlacionado a um ingredient, com dados da junção. */
export type PurchaseItemWithLink = PurchaseItem & {
	link_id: string
	conversion_factor: number
	is_default: boolean
}

/** Resumo do purchase_item (item de compra) vinculado a um item de produto. */
export type LinkedPurchaseItem = Pick<
	PurchaseItem,
	"id" | "description" | "catmat_item_codigo" | "catmat_item_descricao" | "purchase_measure_unit" | "unit_price"
>

/** ingredient_item (item de produto / estoque) com o item de compra vinculado. */
export type IngredientItemWithPurchase = IngredientItem & {
	purchase_item: LinkedPurchaseItem | null
}

export const foldersQueryOptions = (includeDeleted = false) =>
	queryOptions({
		queryKey: ["ingredients", "folders", includeDeleted ? "with-deleted" : "active"],
		queryFn: () => fetchFoldersFn({ data: { includeDeleted } }) as Promise<Folder[]>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientsQueryOptions = (folderId?: string) =>
	queryOptions({
		queryKey: ["ingredients", "ingredients", folderId || "all"],
		queryFn: () => fetchIngredientsFn({ data: { folderId } }) as Promise<Ingredient[]>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientItemsQueryOptions = (ingredientId?: string) =>
	queryOptions({
		queryKey: ["ingredients", "items", ingredientId || "all"],
		queryFn: () => fetchIngredientItemsFn({ data: { ingredientId } }) as Promise<IngredientItemWithPurchase[]>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientQueryOptions = (ingredientId: string) =>
	queryOptions({
		queryKey: ["ingredients", "ingredient", ingredientId],
		queryFn: () => fetchIngredientFn({ data: { id: ingredientId } }) as Promise<Ingredient>,
		staleTime: 10 * 60 * 1000,
	})

export const purchaseItemsQueryOptions = (ingredientId: string) =>
	queryOptions({
		queryKey: ["ingredients", "purchase-items", ingredientId],
		queryFn: () => fetchIngredientPurchaseItemsFn({ data: { ingredientId } }) as Promise<PurchaseItemWithLink[]>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientsTreeQueryOptions = (includeDeleted = false) =>
	queryOptions({
		queryKey: ["ingredients", "tree", includeDeleted ? "with-deleted" : "active"],
		queryFn: async () => {
			const [folders, ingredients, ingredientItems] = await Promise.all([
				fetchFoldersFn({ data: { includeDeleted } }) as Promise<Folder[]>,
				fetchIngredientsFn({ data: { includeDeleted } }) as Promise<Ingredient[]>,
				// Itens de compra/produto sempre ativos: contagem de badges não deve inflar com excluídos.
				fetchIngredientItemsFn({ data: {} }) as Promise<IngredientItem[]>,
			])
			return { folders, ingredients, ingredientItems }
		},
		staleTime: 10 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	})

export const nutrientsQueryOptions = () =>
	queryOptions({
		queryKey: ["ingredients", "nutrients"],
		queryFn: () => fetchNutrientsFn() as Promise<Nutrient[]>,
		staleTime: 30 * 60 * 1000,
	})

export const ingredientNutrientsQueryOptions = (ingredientId: string) =>
	queryOptions({
		queryKey: ["ingredients", "ingredient-nutrients", ingredientId],
		queryFn: () => fetchIngredientNutrientsFn({ data: { ingredientId } }) as Promise<(IngredientNutrient & { nutrient: Nutrient })[]>,
		staleTime: 5 * 60 * 1000,
	})

export const ingredientVersionsQueryOptions = (ingredientId: string) =>
	queryOptions({
		queryKey: ["ingredients", "versions", ingredientId],
		queryFn: () => fetchIngredientVersionsFn({ data: { ingredientId } }) as Promise<IngredientVersion[]>,
		staleTime: 60 * 1000,
	})

export const ceafaQueryOptions = (search?: string) =>
	queryOptions({
		queryKey: ["ingredients", "ceafa", search || ""],
		queryFn: () => fetchCeafaFn({ data: { search } }) as Promise<Ceafa[]>,
		staleTime: 10 * 60 * 1000,
	})

export const catmatQueryOptions = (search: string) =>
	queryOptions({
		queryKey: ["catmat", "items", search],
		queryFn: () => fetchCatmatItemsFn({ data: { search } }),
		staleTime: 5 * 60 * 1000,
		enabled: search.trim().length >= 3,
	})

export function useFolders() {
	const query = useQuery(foldersQueryOptions())
	return { folders: query.data, error: query.error, refetch: query.refetch }
}

export function useIngredients(folderId?: string) {
	const query = useQuery(ingredientsQueryOptions(folderId))
	return { ingredients: query.data, error: query.error, refetch: query.refetch }
}

export function useIngredientItems(ingredientId?: string) {
	const query = useQuery(ingredientItemsQueryOptions(ingredientId))
	return { ingredientItems: query.data, error: query.error, refetch: query.refetch }
}

export function useIngredient(ingredientId: string) {
	const query = useQuery(ingredientQueryOptions(ingredientId))
	return { ingredient: query.data, error: query.error, refetch: query.refetch }
}

export function useIngredientsTree(includeDeleted = false) {
	const query = useQuery(ingredientsTreeQueryOptions(includeDeleted))
	return { tree: query.data, error: query.error, refetch: query.refetch }
}

export function useNutrients() {
	const query = useQuery(nutrientsQueryOptions())
	return { nutrients: query.data, isLoading: query.isLoading, error: query.error }
}

export function useIngredientNutrients(ingredientId: string) {
	const query = useQuery(ingredientNutrientsQueryOptions(ingredientId))
	return { ingredientNutrients: query.data, isLoading: query.isLoading, error: query.error }
}

export function useCeafa(search?: string) {
	const query = useQuery(ceafaQueryOptions(search))
	return { ceafaList: query.data, isLoading: query.isLoading }
}

export function useCreateFolder() {
	const mutation = useMutation({
		mutationFn: (payload: FolderInsert) => createFolderFn({ data: { description: payload.description, parentId: payload.parent_id ?? undefined } }),
	})
	return {
		createFolder: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateFolder() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: FolderUpdate }) =>
			updateFolderFn({ data: { id, description: payload.description, parentId: payload.parent_id ?? undefined } }),
	})
	return {
		updateFolder: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeleteFolder() {
	const mutation = useMutation({
		mutationFn: (id: string) => deleteFolderFn({ data: { id } }),
	})
	return {
		deleteFolder: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

export function useCreateIngredient() {
	const mutation = useMutation({
		mutationFn: (payload: IngredientInsert) =>
			createIngredientFn({
				data: {
					description: payload.description ?? "",
					folderId: payload.folder_id ?? undefined,
					measureUnit: payload.measure_unit ?? undefined,
					correctionFactor: payload.correction_factor ?? undefined,
					ceafaId: payload.ceafa_id ?? undefined,
				},
			}),
	})
	return {
		createIngredient: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateIngredient() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: IngredientUpdate }) =>
			updateIngredientFn({
				data: {
					id,
					description: payload.description ?? "",
					folderId: payload.folder_id ?? undefined,
					measureUnit: payload.measure_unit ?? undefined,
					correctionFactor: payload.correction_factor ?? undefined,
					ceafaId: payload.ceafa_id ?? undefined,
				},
			}),
	})
	return {
		updateIngredient: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeleteIngredient() {
	const mutation = useMutation({
		mutationFn: (id: string) => deleteIngredientFn({ data: { id } }),
	})
	return {
		deleteIngredient: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

export function useRestoreFolder() {
	const mutation = useMutation({
		mutationFn: (id: string) => restoreFolderFn({ data: { id } }),
	})
	return {
		restoreFolder: mutation.mutateAsync,
		isRestoring: mutation.isPending,
		error: mutation.error,
	}
}

export function useRestoreIngredient() {
	const mutation = useMutation({
		mutationFn: (id: string) => restoreIngredientFn({ data: { id } }),
	})
	return {
		restoreIngredient: mutation.mutateAsync,
		isRestoring: mutation.isPending,
		error: mutation.error,
	}
}

export function useCreateIngredientItem() {
	const mutation = useMutation({
		mutationFn: (payload: IngredientItemInsert) =>
			createIngredientItemFn({
				data: {
					ingredientId: payload.ingredient_id ?? undefined,
					description: payload.description ?? undefined,
					barcode: payload.barcode ?? undefined,
					purchaseMeasureUnit: payload.purchase_measure_unit ?? undefined,
					unitContentQuantity: payload.unit_content_quantity ?? undefined,
					correctionFactor: payload.correction_factor ?? undefined,
					purchaseItemId: payload.purchase_item_id ?? null,
				},
			}),
	})
	return {
		createIngredientItem: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateIngredientItem() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: IngredientItemUpdate }) =>
			updateIngredientItemFn({
				data: {
					id,
					ingredientId: payload.ingredient_id ?? undefined,
					description: payload.description ?? undefined,
					barcode: payload.barcode ?? undefined,
					purchaseMeasureUnit: payload.purchase_measure_unit ?? undefined,
					unitContentQuantity: payload.unit_content_quantity ?? undefined,
					correctionFactor: payload.correction_factor ?? undefined,
					purchaseItemId: payload.purchase_item_id ?? null,
				},
			}),
	})
	return {
		updateIngredientItem: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeleteIngredientItem() {
	const mutation = useMutation({
		mutationFn: (id: string) => deleteIngredientItemFn({ data: { id } }),
	})
	return {
		deleteIngredientItem: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

// ── purchase_item (CATMAT) ────────────────────────────────────────────────────

export function usePurchaseItems(ingredientId: string) {
	const query = useQuery(purchaseItemsQueryOptions(ingredientId))
	return { purchaseItems: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch }
}

// PurchaseItemWriteSchema exige catmat_item_codigo/unit_price positivos — sanitiza 0/inválidos para null.
const positiveOrNull = (n?: number | null) => (n != null && n > 0 ? n : null)

export interface CreatePurchaseItemPayload {
	ingredientId: string
	description: string
	purchaseMeasureUnit?: string | null
	catmatItemCodigo?: number | null
	catmatItemDescricao?: string | null
	unitPrice?: number | null
	conversionFactor?: number | null
}

export function useCreatePurchaseItem() {
	const mutation = useMutation({
		// Cria o purchase_item e o vínculo com o ingredient (junção) em sequência.
		mutationFn: async (p: CreatePurchaseItemPayload) => {
			const codigo = positiveOrNull(p.catmatItemCodigo)
			const pi = await createPurchaseItemFn({
				data: {
					payload: {
						description: p.description,
						purchase_measure_unit: p.purchaseMeasureUnit ?? null,
						catmat_item_codigo: codigo,
						catmat_item_descricao: p.catmatItemDescricao ?? null,
						catmat_match_status: codigo != null ? "matched" : null,
						unit_price: positiveOrNull(p.unitPrice),
					},
				},
			})
			await upsertPurchaseItemIngredientFn({
				data: {
					payload: {
						purchase_item_id: pi.id,
						ingredient_id: p.ingredientId,
						conversion_factor: positiveOrNull(p.conversionFactor) ?? 1.0,
						is_default: false,
					},
				},
			})
			return pi
		},
	})
	return {
		createPurchaseItem: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export interface UpdatePurchaseItemPayload {
	id: string
	ingredientId: string
	description: string
	purchaseMeasureUnit?: string | null
	catmatItemCodigo?: number | null
	catmatItemDescricao?: string | null
	unitPrice?: number | null
	conversionFactor?: number | null
	isDefault?: boolean
}

export function useUpdatePurchaseItem() {
	const mutation = useMutation({
		mutationFn: async (p: UpdatePurchaseItemPayload) => {
			const codigo = positiveOrNull(p.catmatItemCodigo)
			const pi = await updatePurchaseItemFn({
				data: {
					id: p.id,
					payload: {
						description: p.description,
						purchase_measure_unit: p.purchaseMeasureUnit ?? null,
						catmat_item_codigo: codigo,
						catmat_item_descricao: p.catmatItemDescricao ?? null,
						catmat_match_status: codigo != null ? "matched" : "no_match",
						unit_price: positiveOrNull(p.unitPrice),
					},
				},
			})
			// Atualiza o fator de conversão do vínculo (upsert por purchase_item_id+ingredient_id).
			await upsertPurchaseItemIngredientFn({
				data: {
					payload: {
						purchase_item_id: p.id,
						ingredient_id: p.ingredientId,
						conversion_factor: positiveOrNull(p.conversionFactor) ?? 1.0,
						is_default: p.isDefault ?? false,
					},
				},
			})
			return pi
		},
	})
	return {
		updatePurchaseItem: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeletePurchaseItemLink() {
	const mutation = useMutation({
		// Remove apenas o vínculo (junção); o purchase_item é preservado (pode ter outros vínculos).
		mutationFn: (linkId: string) => deletePurchaseItemIngredientFn({ data: { id: linkId } }),
	})
	return {
		deletePurchaseItemLink: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

export function useSetIngredientNutrients() {
	const mutation = useMutation({
		mutationFn: ({ ingredientId, nutrients }: { ingredientId: string; nutrients: { nutrient_id: string; nutrient_value: number | null }[] }) =>
			setIngredientNutrientsFn({
				data: {
					ingredientId,
					nutrients: nutrients.map((n) => ({ nutrientId: n.nutrient_id, nutrientValue: n.nutrient_value })),
				},
			}),
	})
	return {
		setIngredientNutrients: mutation.mutateAsync,
		isSaving: mutation.isPending,
		error: mutation.error,
	}
}

// ── Versionamento (histórico de alterações) ───────────────────────────────────

export function useIngredientVersions(ingredientId: string) {
	const query = useQuery(ingredientVersionsQueryOptions(ingredientId))
	return { versions: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch }
}

export interface SaveIngredientDetailsPayload {
	id: string
	description: string
	folderId?: string | null
	measureUnit?: string | null
	correctionFactor?: number | null
	ceafaId?: string | null
	nutrients: { nutrient_id: string; nutrient_value: number | null }[]
}

/** Salva identificação + nutrientes e registra UMA versão do insumo. */
export function useSaveIngredientDetails() {
	const mutation = useMutation({
		mutationFn: (p: SaveIngredientDetailsPayload) =>
			saveIngredientDetailsFn({
				data: {
					id: p.id,
					description: p.description,
					folderId: p.folderId ?? undefined,
					measureUnit: p.measureUnit ?? undefined,
					correctionFactor: p.correctionFactor ?? undefined,
					ceafaId: p.ceafaId ?? undefined,
					nutrients: p.nutrients.map((n) => ({ nutrientId: n.nutrient_id, nutrientValue: n.nutrient_value })),
				},
			}),
	})
	return { saveIngredientDetails: mutation.mutateAsync, isSaving: mutation.isPending, error: mutation.error }
}

/** Registra uma versão do insumo após mudanças feitas por fluxos separados (itens de compra/produto). */
export function useRecordIngredientVersion() {
	const queryClient = useQueryClient()
	const mutation = useMutation({
		mutationFn: (ingredientId: string) => recordIngredientVersionFn({ data: { ingredientId } }),
		onSuccess: (_res, ingredientId) => {
			queryClient.invalidateQueries({ queryKey: ["ingredients", "versions", ingredientId] })
		},
	})
	return { recordIngredientVersion: mutation.mutateAsync, isRecording: mutation.isPending }
}

export function useRestoreIngredientVersion() {
	const queryClient = useQueryClient()
	const mutation = useMutation({
		mutationFn: ({ ingredientId, versionId }: { ingredientId: string; versionId: string }) => restoreIngredientVersionFn({ data: { ingredientId, versionId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["ingredients"] })
		},
	})
	return { restoreIngredientVersion: mutation.mutateAsync, isRestoring: mutation.isPending }
}
