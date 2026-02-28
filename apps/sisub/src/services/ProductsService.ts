import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import {
	createFolderFn,
	createProductFn,
	createProductItemFn,
	deleteFolderFn,
	deleteProductFn,
	deleteProductItemFn,
	fetchFoldersFn,
	fetchProductItemsFn,
	fetchProductsFn,
	updateFolderFn,
	updateProductFn,
	updateProductItemFn,
} from "@/server/products.fn"
import type {
	Folder,
	FolderInsert,
	FolderUpdate,
	Product,
	ProductInsert,
	ProductItem,
	ProductItemInsert,
	ProductItemUpdate,
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

export function useProductsTree() {
	const query = useQuery(productsTreeQueryOptions())
	return { tree: query.data, error: query.error, refetch: query.refetch }
}

// ========================================
// Mutation Hooks
// ========================================

export function useCreateFolder() {
	const mutation = useMutation({
		mutationFn: (payload: FolderInsert) =>
			createFolderFn({ data: { payload: payload as Record<string, unknown> } }),
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
			updateFolderFn({ data: { id, payload: payload as Record<string, unknown> } }),
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
		mutationFn: (payload: ProductInsert) =>
			createProductFn({ data: { payload: payload as Record<string, unknown> } }),
	})
	return {
		createProduct: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	}
}

export function useUpdateProduct() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ProductUpdate }) =>
			updateProductFn({ data: { id, payload: payload as Record<string, unknown> } }),
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
		mutationFn: (payload: ProductItemInsert) =>
			createProductItemFn({ data: { payload: payload as Record<string, unknown> } }),
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
