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

export type { Ceafa, Folder, Ingredient, IngredientItem, IngredientNutrient, Nutrient }

export interface IngredientNutrientWithDetails extends IngredientNutrient {
	nutrient: Nutrient
}

export interface IngredientWithDetails extends Ingredient {
	ceafa: Ceafa | null
	nutrients: IngredientNutrientWithDetails[]
}

export interface IngredientWithItems extends Ingredient {
	items: IngredientItem[]
}

export interface FolderWithIngredients extends Folder {
	ingredients: IngredientWithItems[]
}

export interface FolderWithChildren extends Folder {
	children: FolderWithChildren[]
	ingredients: IngredientWithItems[]
}

export type CreateFolderPayload = Omit<FolderInsert, "id" | "created_at">

export type EditFolderPayload = FolderUpdate

export type CreateIngredientPayload = Omit<IngredientInsert, "id" | "created_at">

export type EditIngredientPayload = IngredientUpdate

export type CreateIngredientItemPayload = Omit<IngredientItemInsert, "id" | "created_at">

export type EditIngredientItemPayload = IngredientItemUpdate

export type TreeNodeType = "folder" | "ingredient" | "ingredient_item"

export interface IngredientTreeNode {
	id: string
	type: TreeNodeType
	label: string
	parentId: string | null
	level: number
	hasChildren: boolean
	isExpanded?: boolean
	data: Folder | Ingredient | IngredientItem
}

export interface FlatIngredientTree {
	nodes: IngredientTreeNode[]
	byId: Record<string, IngredientTreeNode>
	byParentId: Record<string, IngredientTreeNode[]>
}

export interface IngredientDialogState {
	isOpen: boolean
	mode: "create" | "edit"
	type: TreeNodeType
	data?: Folder | Ingredient | IngredientItem
	parentId?: string | null
}
