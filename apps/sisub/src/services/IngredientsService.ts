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
} from "@iefa/database/sisub"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
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
	fetchNutrientsFn,
	setIngredientNutrientsFn,
	updateFolderFn,
	updateIngredientFn,
	updateIngredientItemFn,
} from "@/server/ingredients.fn"

export const foldersQueryOptions = () =>
	queryOptions({
		queryKey: ["ingredients", "folders"],
		queryFn: () => fetchFoldersFn() as Promise<Folder[]>,
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
		queryFn: () => fetchIngredientItemsFn({ data: { ingredientId } }) as Promise<IngredientItem[]>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientQueryOptions = (ingredientId: string) =>
	queryOptions({
		queryKey: ["ingredients", "ingredient", ingredientId],
		queryFn: () => fetchIngredientFn({ data: { id: ingredientId } }) as Promise<Ingredient>,
		staleTime: 10 * 60 * 1000,
	})

export const ingredientsTreeQueryOptions = () =>
	queryOptions({
		queryKey: ["ingredients", "tree"],
		queryFn: async () => {
			const [folders, ingredients, ingredientItems] = await Promise.all([
				fetchFoldersFn() as Promise<Folder[]>,
				fetchIngredientsFn({ data: {} }) as Promise<Ingredient[]>,
				fetchIngredientItemsFn({ data: {} }) as Promise<IngredientItem[]>,
			])
			return { folders, ingredients, ingredientItems }
		},
		staleTime: 10 * 60 * 1000,
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

export function useIngredientsTree() {
	const query = useQuery(ingredientsTreeQueryOptions())
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
		mutationFn: (payload: FolderInsert) => createFolderFn({ data: { payload: payload as Record<string, unknown> } }),
	})
	return {
		createFolder: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateFolder() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: FolderUpdate }) => updateFolderFn({ data: { id, payload: payload as Record<string, unknown> } }),
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
		mutationFn: (payload: IngredientInsert) => createIngredientFn({ data: { payload: payload as Record<string, unknown> } }),
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
			updateIngredientFn({ data: { id, payload: payload as Record<string, unknown> } }),
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

export function useCreateIngredientItem() {
	const mutation = useMutation({
		mutationFn: (payload: IngredientItemInsert) => createIngredientItemFn({ data: { payload: payload as Record<string, unknown> } }),
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
			updateIngredientItemFn({ data: { id, payload: payload as Record<string, unknown> } }),
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

export function useSetIngredientNutrients() {
	const mutation = useMutation({
		mutationFn: ({ ingredientId, nutrients }: { ingredientId: string; nutrients: { nutrient_id: string; nutrient_value: number | null }[] }) =>
			setIngredientNutrientsFn({ data: { ingredientId, nutrients } }),
	})
	return {
		setIngredientNutrients: mutation.mutateAsync,
		isSaving: mutation.isPending,
		error: mutation.error,
	}
}
