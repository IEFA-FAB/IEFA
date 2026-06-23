/**
 * Tipos do editor de Fluxo de Produção (cliente xyflow).
 *
 * O grafo é construído a partir do contrato `fetchRecipeFlow` e serializado de volta
 * em `SaveRecipeFlow`. Nós de etapa (`step`) viram `recipe_step`; nós de insumo
 * (`ingredient`) são fontes visuais dos `recipe_ingredients` (não viram etapa).
 */

import type { Edge, Node } from "@xyflow/react"

/** Saída (produto intermediário) de uma etapa — vira um handle de source no nó. */
export interface FlowOutput {
	clientId: string
	label: string | null
	quantity: number | null
	measureUnit: string | null
	isFinal: boolean
}

/** Utensílio usado na etapa (instância). */
export interface FlowUtensil {
	id: string
	name: string
}

export interface StepNodeData extends Record<string, unknown> {
	label: string | null
	description: string | null
	durationMinutes: number | null
	stepTemplateId: string | null
	outputs: FlowOutput[]
	utensils: FlowUtensil[]
}

export interface IngredientNodeData extends Record<string, unknown> {
	recipeIngredientId: string
	name: string
	measureUnit: string
	netQuantity: number
	isOptional: boolean
}

export type StepNode = Node<StepNodeData, "step">
export type IngredientNode = Node<IngredientNodeData, "ingredient">
export type FlowNode = StepNode | IngredientNode

/** Edge = um `recipe_step_input`. `raw` vem de insumo; `intermediate` de uma saída de etapa. */
export interface MaterialEdgeData extends Record<string, unknown> {
	kind: "raw" | "intermediate"
	quantity: number | null
	measureUnit: string | null
	/** Preenchido quando kind === "raw". */
	recipeIngredientId?: string
}

export type MaterialEdge = Edge<MaterialEdgeData, "material">

/** Insumo da receita disponível na palette (origem dos nós `ingredient`). */
export interface RecipeIngredientSource {
	recipeIngredientId: string
	name: string
	measureUnit: string
	netQuantity: number
	isOptional: boolean
}

/** Handle único de target das etapas (todas as edges entram por aqui). */
export const STEP_TARGET_HANDLE = "in"
/** Handle único de source dos nós de insumo. */
export const INGREDIENT_SOURCE_HANDLE = "out"
/** Prefixo do id de nó de insumo no canvas. */
export const INGREDIENT_NODE_PREFIX = "ing:"
