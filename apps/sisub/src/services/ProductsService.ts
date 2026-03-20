import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import {
	createFolderFn,
	createProductFn,
	createProductItemFn,
	deleteFolderFn,
	deleteProductFn,
	deleteProductItemFn,
	fetchCeafaFn,
	fetchFoldersFn,
	fetchNutrientsFn,
	fetchProductFn,
	fetchProductItemsFn,
	fetchProductNutrientsFn,
	fetchProductsFn,
	setProductNutrientsFn,
	updateFolderFn,
	updateProductFn,
	updateProductItemFn,
} from "@/server/products.fn"
import type {
	Ceafa,
	Folder,
	FolderInsert,
	FolderUpdate,
	Nutrient,
	Product,
	ProductInsert,
	ProductItem,
	ProductItemInsert,
	ProductItemUpdate,
	ProductNutrient,
	ProductUpdate,
} from "@/types/supabase.types"

// ========================================
// Query Options
// ========================================

export const foldersQueryOptions = () =>
	queryOptions({
		queryKey: ["products", "folders"],
		queryFn: () => fetchFoldersFn() as Promise<Folder[]>,
		staleTime: 10 * 60 * 1000,
	})

export const productsQueryOptions = (folderId?: string) =>
	queryOptions({
		queryKey: ["products", "products", folderId || "all"],
		queryFn: () => fetchProductsFn({ data: { folderId } }) as Promise<Product[]>,
		staleTime: 10 * 60 * 1000,
	})

export const productItemsQueryOptions = (productId?: string) =>
	queryOptions({
		queryKey: ["products", "items", productId || "all"],
		queryFn: () => fetchProductItemsFn({ data: { productId } }) as Promise<ProductItem[]>,
		staleTime: 10 * 60 * 1000,
	})

export const productQueryOptions = (productId: string) =>
	queryOptions({
		queryKey: ["products", "product", productId],
		queryFn: () => fetchProductFn({ data: { id: productId } }) as Promise<Product>,
		staleTime: 10 * 60 * 1000,
	})

export const productsTreeQueryOptions = () =>
	queryOptions({
		queryKey: ["products", "tree"],
		queryFn: async () => {
			const [folders, products, productItems] = await Promise.all([
				fetchFoldersFn() as Promise<Folder[]>,
				fetchProductsFn({ data: {} }) as Promise<Product[]>,
				fetchProductItemsFn({ data: {} }) as Promise<ProductItem[]>,
			])
			return { folders, products, productItems }
		},
		staleTime: 10 * 60 * 1000,
	})

export const nutrientsQueryOptions = () =>
	queryOptions({
		queryKey: ["products", "nutrients"],
		queryFn: () => fetchNutrientsFn() as Promise<Nutrient[]>,
		staleTime: 30 * 60 * 1000,
	})

export const productNutrientsQueryOptions = (productId: string) =>
	queryOptions({
		queryKey: ["products", "product-nutrients", productId],
		queryFn: () => fetchProductNutrientsFn({ data: { productId } }) as Promise<(ProductNutrient & { nutrient: Nutrient })[]>,
		staleTime: 5 * 60 * 1000,
	})

export const ceafaQueryOptions = (search?: string) =>
	queryOptions({
		queryKey: ["products", "ceafa", search || ""],
		queryFn: () => fetchCeafaFn({ data: { search } }) as Promise<Ceafa[]>,
		staleTime: 10 * 60 * 1000,
	})

// ========================================
// Basic Hooks
// ========================================

export function useFolders() {
	const query = useQuery(foldersQueryOptions())
	return { folders: query.data, error: query.error, refetch: query.refetch }
}

export function useProducts(folderId?: string) {
	const query = useQuery(productsQueryOptions(folderId))
	return { products: query.data, error: query.error, refetch: query.refetch }
}

export function useProductItems(productId?: string) {
	const query = useQuery(productItemsQueryOptions(productId))
	return { productItems: query.data, error: query.error, refetch: query.refetch }
}

export function useProduct(productId: string) {
	const query = useQuery(productQueryOptions(productId))
	return { product: query.data, error: query.error, refetch: query.refetch }
}

export function useProductsTree() {
	const query = useQuery(productsTreeQueryOptions())
	return { tree: query.data, error: query.error, refetch: query.refetch }
}

export function useNutrients() {
	const query = useQuery(nutrientsQueryOptions())
	return { nutrients: query.data, isLoading: query.isLoading, error: query.error }
}

export function useProductNutrients(productId: string) {
	const query = useQuery(productNutrientsQueryOptions(productId))
	return { productNutrients: query.data, isLoading: query.isLoading, error: query.error }
}

export function useCeafa(search?: string) {
	const query = useQuery(ceafaQueryOptions(search))
	return { ceafaList: query.data, isLoading: query.isLoading }
}

// ========================================
// Mutation Hooks
// ========================================

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

export function useCreateProduct() {
	const mutation = useMutation({
		mutationFn: (payload: ProductInsert) => createProductFn({ data: { payload: payload as Record<string, unknown> } }),
	})
	return {
		createProduct: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateProduct() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ProductUpdate }) => updateProductFn({ data: { id, payload: payload as Record<string, unknown> } }),
	})
	return {
		updateProduct: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeleteProduct() {
	const mutation = useMutation({
		mutationFn: (id: string) => deleteProductFn({ data: { id } }),
	})
	return {
		deleteProduct: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

export function useCreateProductItem() {
	const mutation = useMutation({
		mutationFn: (payload: ProductItemInsert) => createProductItemFn({ data: { payload: payload as Record<string, unknown> } }),
	})
	return {
		createProductItem: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateProductItem() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ProductItemUpdate }) =>
			updateProductItemFn({ data: { id, payload: payload as Record<string, unknown> } }),
	})
	return {
		updateProductItem: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	}
}

export function useDeleteProductItem() {
	const mutation = useMutation({
		mutationFn: (id: string) => deleteProductItemFn({ data: { id } }),
	})
	return {
		deleteProductItem: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	}
}

export function useSetProductNutrients() {
	const mutation = useMutation({
		mutationFn: ({ productId, nutrients }: { productId: string; nutrients: { nutrient_id: string; nutrient_value: number | null }[] }) =>
			setProductNutrientsFn({ data: { productId, nutrients } }),
	})
	return {
		setProductNutrients: mutation.mutateAsync,
		isSaving: mutation.isPending,
		error: mutation.error,
	}
}
