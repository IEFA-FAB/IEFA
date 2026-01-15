import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
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
} from "@/types/supabase.types";

// ========================================
// Fetchers (API Layer)
// ========================================

/**
 * Busca todos os folders com hierarquia completa
 */
export async function fetchFolders(): Promise<Folder[]> {
	const { data, error } = await supabase
		.from("folder")
		.select("*")
		.is("deleted_at", null)
		.order("created_at", { ascending: true });

	if (error) throw new Error(error.message);
	return data || [];
}

/**
 * Busca produtos filtrados por folder (opcional)
 */
export async function fetchProducts(folderId?: string): Promise<Product[]> {
	let query = supabase
		.from("product")
		.select("*")
		.is("deleted_at", null)
		.order("description", { ascending: true });

	if (folderId) {
		query = query.eq("folder_id", folderId);
	}

	const { data, error } = await query;

	if (error) throw new Error(error.message);
	return data || [];
}

/**
 * Busca itens de produto filtrados por product (opcional)
 */
export async function fetchProductItems(
	productId?: string,
): Promise<ProductItem[]> {
	let query = supabase
		.from("product_item")
		.select("*")
		.is("deleted_at", null)
		.order("description", { ascending: true });

	if (productId) {
		query = query.eq("product_id", productId);
	}

	const { data, error } = await query;

	if (error) throw new Error(error.message);
	return data || [];
}

/**
 * Busca árvore completa: folders, products e items
 */
export async function fetchProductsTree(): Promise<{
	folders: Folder[];
	products: Product[];
	productItems: ProductItem[];
}> {
	const [folders, products, productItems] = await Promise.all([
		fetchFolders(),
		fetchProducts(),
		fetchProductItems(),
	]);

	return { folders, products, productItems };
}

// ========================================
// CRUD: Folders
// ========================================

export async function createFolder(payload: FolderInsert): Promise<Folder> {
	const { data, error } = await supabase
		.from("folder")
		.insert(payload)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function updateFolder(
	id: string,
	payload: FolderUpdate,
): Promise<Folder> {
	const { data, error } = await supabase
		.from("folder")
		.update(payload)
		.eq("id", id)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function deleteFolder(id: string): Promise<void> {
	const { error } = await supabase
		.from("folder")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);

	if (error) throw new Error(error.message);
}

// ========================================
// CRUD: Products
// ========================================

export async function createProduct(payload: ProductInsert): Promise<Product> {
	const { data, error } = await supabase
		.from("product")
		.insert(payload)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function updateProduct(
	id: string,
	payload: ProductUpdate,
): Promise<Product> {
	const { data, error } = await supabase
		.from("product")
		.update(payload)
		.eq("id", id)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function deleteProduct(id: string): Promise<void> {
	const { error } = await supabase
		.from("product")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);

	if (error) throw new Error(error.message);
}

// ========================================
// CRUD: Product Items
// ========================================

export async function createProductItem(
	payload: ProductItemInsert,
): Promise<ProductItem> {
	const { data, error } = await supabase
		.from("product_item")
		.insert(payload)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function updateProductItem(
	id: string,
	payload: ProductItemUpdate,
): Promise<ProductItem> {
	const { data, error } = await supabase
		.from("product_item")
		.update(payload)
		.eq("id", id)
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data;
}

export async function deleteProductItem(id: string): Promise<void> {
	const { error } = await supabase
		.from("product_item")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);

	if (error) throw new Error(error.message);
}

// ========================================
// Query Options
// ========================================

export const foldersQueryOptions = () =>
	queryOptions({
		queryKey: ["products", "folders"],
		queryFn: fetchFolders,
		staleTime: 10 * 60 * 1000, // 10 minutos
	});

export const productsQueryOptions = (folderId?: string) =>
	queryOptions({
		queryKey: ["products", "products", folderId || "all"],
		queryFn: () => fetchProducts(folderId),
		staleTime: 10 * 60 * 1000,
	});

export const productItemsQueryOptions = (productId?: string) =>
	queryOptions({
		queryKey: ["products", "items", productId || "all"],
		queryFn: () => fetchProductItems(productId),
		staleTime: 10 * 60 * 1000,
	});

export const productsTreeQueryOptions = () =>
	queryOptions({
		queryKey: ["products", "tree"],
		queryFn: fetchProductsTree,
		staleTime: 10 * 60 * 1000,
	});

// ========================================
// Basic Hooks (Wrappers de 1 query)
// ========================================

/**
 * Hook básico para folders
 * NÃO expõe isLoading - componente decide skeleton
 */
export function useFolders() {
	const query = useQuery(foldersQueryOptions());
	return {
		folders: query.data,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * Hook básico para produtos
 * NÃO expõe isLoading - componente decide skeleton
 */
export function useProducts(folderId?: string) {
	const query = useQuery(productsQueryOptions(folderId));
	return {
		products: query.data,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * Hook básico para itens de produto
 * NÃO expõe isLoading - componente decide skeleton
 */
export function useProductItems(productId?: string) {
	const query = useQuery(productItemsQueryOptions(productId));
	return {
		productItems: query.data,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * Hook para árvore completa
 * NÃO expõe isLoading - componente decide skeleton
 */
export function useProductsTree() {
	const query = useQuery(productsTreeQueryOptions());
	return {
		tree: query.data,
		error: query.error,
		refetch: query.refetch,
	};
}

// ========================================
// Mutation Hooks (SEMPRE expõem isPending)
// ========================================

export function useCreateFolder() {
	const mutation = useMutation({
		mutationFn: createFolder,
	});

	return {
		createFolder: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	};
}

export function useUpdateFolder() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: FolderUpdate }) =>
			updateFolder(id, payload),
	});

	return {
		updateFolder: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	};
}

export function useDeleteFolder() {
	const mutation = useMutation({
		mutationFn: deleteFolder,
	});

	return {
		deleteFolder: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	};
}

export function useCreateProduct() {
	const mutation = useMutation({
		mutationFn: createProduct,
	});

	return {
		createProduct: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	};
}

export function useUpdateProduct() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ProductUpdate }) =>
			updateProduct(id, payload),
	});

	return {
		updateProduct: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	};
}

export function useDeleteProduct() {
	const mutation = useMutation({
		mutationFn: deleteProduct,
	});

	return {
		deleteProduct: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	};
}

export function useCreateProductItem() {
	const mutation = useMutation({
		mutationFn: createProductItem,
	});

	return {
		createProductItem: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
	};
}

export function useUpdateProductItem() {
	const mutation = useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ProductItemUpdate }) =>
			updateProductItem(id, payload),
	});

	return {
		updateProductItem: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
	};
}

export function useDeleteProductItem() {
	const mutation = useMutation({
		mutationFn: deleteProductItem,
	});

	return {
		deleteProductItem: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error,
	};
}
