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
// Re-exports (base types from DB)
// ========================================

export type { Folder, Product, ProductItem }

// ========================================
// Composições (Types com relações)
// ========================================

/**
 * Produto com seus itens de compra
 */
export interface ProductWithItems extends Product {
	items: ProductItem[]
}

/**
 * Folder com seus produtos
 */
export interface FolderWithProducts extends Folder {
	products: ProductWithItems[]
}

/**
 * Folder com subfolders (hierarquia recursiva)
 */
export interface FolderWithChildren extends Folder {
	children: FolderWithChildren[]
	products: ProductWithItems[]
}

// ========================================
// Tipos de Formulário (Payloads)
// ========================================

/**
 * Payload para criar novo Folder
 */
export type CreateFolderPayload = Omit<FolderInsert, "id" | "created_at">

/**
 * Payload para editar Folder
 */
export type EditFolderPayload = FolderUpdate

/**
 * Payload para criar novo Product
 */
export type CreateProductPayload = Omit<ProductInsert, "id" | "created_at">

/**
 * Payload para editar Product
 */
export type EditProductPayload = ProductUpdate

/**
 * Payload para criar novo Product Item
 */
export type CreateProductItemPayload = Omit<ProductItemInsert, "id" | "created_at">

/**
 * Payload para editar Product Item
 */
export type EditProductItemPayload = ProductItemUpdate

// ========================================
// Tipos de UI (Tree View)
// ========================================

/**
 * Tipo de nó da árvore hierárquica
 */
export type TreeNodeType = "folder" | "product" | "product_item"

/**
 * Nó genérico da árvore de produtos
 */
export interface ProductTreeNode {
	id: string
	type: TreeNodeType
	label: string
	parentId: string | null
	level: number
	hasChildren: boolean
	isExpanded?: boolean
	data: Folder | Product | ProductItem
}

/**
 * Estrutura flat para virtualização
 * (árvore achatada para renderização eficiente)
 */
export interface FlatProductTree {
	nodes: ProductTreeNode[]
	byId: Record<string, ProductTreeNode>
	byParentId: Record<string, ProductTreeNode[]>
}

// ========================================
// Estados de UI
// ========================================

/**
 * Estado do diálogo de edição
 */
export interface ProductDialogState {
	isOpen: boolean
	mode: "create" | "edit"
	type: TreeNodeType
	data?: Folder | Product | ProductItem
	parentId?: string | null
}
