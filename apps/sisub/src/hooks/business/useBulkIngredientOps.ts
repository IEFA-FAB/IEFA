import type { Folder, Ingredient } from "@iefa/database/sisub"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { deleteFolderFn, deleteIngredientFn, restoreFolderFn, restoreIngredientFn, updateFolderFn, updateIngredientFn } from "@/server/ingredients.fn"

export type BulkNodeType = "folder" | "ingredient"

/** Nó selecionado para edição em massa — carrega os dados completos da entidade. */
export interface BulkSelectedNode {
	id: string
	type: BulkNodeType
	label: string
	data: Folder | Ingredient
}

export interface BulkResult {
	done: number
	failed: number
}

export interface BulkProgress {
	total: number
	completed: number
}

/** Requisições concorrentes por lote (evita estourar o servidor em centenas de matches). */
const CONCURRENCY = 5

function toNumberOrUndefined(v: unknown): number | undefined {
	if (v == null) return undefined
	const n = Number(v)
	return Number.isFinite(n) ? n : undefined
}

type IngredientOverrides = Partial<{
	description: string
	folderId: string | null
	measureUnit: string | null
	correctionFactor: number
}>

/**
 * `update` reescreve TODAS as colunas listadas na operação de domínio, e
 * `CreateIngredientSchema.description` é obrigatório — portanto enviamos o
 * payload completo do insumo atual e sobrescrevemos apenas os campos desejados.
 */
function ingredientPayload(ing: Ingredient, overrides: IngredientOverrides) {
	return {
		id: ing.id,
		description: overrides.description ?? ing.description ?? "",
		folderId: "folderId" in overrides ? overrides.folderId : (ing.folder_id ?? undefined),
		measureUnit: "measureUnit" in overrides ? overrides.measureUnit : (ing.measure_unit ?? undefined),
		correctionFactor: "correctionFactor" in overrides ? overrides.correctionFactor : toNumberOrUndefined(ing.correction_factor),
		ceafaId: ing.ceafa_id ?? undefined,
	}
}

type FolderOverrides = Partial<{ description: string; parentId: string | null }>

function folderPayload(f: Folder, overrides: FolderOverrides) {
	return {
		id: f.id,
		description: "description" in overrides ? overrides.description : (f.description ?? undefined),
		parentId: "parentId" in overrides ? overrides.parentId : (f.parent_id ?? undefined),
	}
}

/**
 * Orquestra operações de edição em massa sobre pastas e insumos.
 * Faz lote no cliente (pool de concorrência) e invalida a árvore ao final.
 */
export function useBulkIngredientOps() {
	const queryClient = useQueryClient()
	const [isRunning, setIsRunning] = useState(false)
	const [progress, setProgress] = useState<BulkProgress | null>(null)

	async function runBatch<T>(items: T[], task: (item: T) => Promise<unknown>): Promise<BulkResult> {
		if (items.length === 0) return { done: 0, failed: 0 }

		setIsRunning(true)
		setProgress({ total: items.length, completed: 0 })

		let completed = 0
		let failed = 0
		const queue = [...items]

		const worker = async () => {
			while (queue.length > 0) {
				const item = queue.shift()
				if (item === undefined) break
				try {
					await task(item)
				} catch {
					failed++
				}
				completed++
				setProgress({ total: items.length, completed })
			}
		}

		try {
			await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
		} finally {
			setIsRunning(false)
			setProgress(null)
		}

		return { done: completed - failed, failed }
	}

	/** Substitui descrições (localizar e substituir) em pastas e insumos. */
	const replaceDescriptions = (edits: { node: BulkSelectedNode; newDescription: string }[]) =>
		runBatch(edits, ({ node, newDescription }) =>
			node.type === "folder"
				? updateFolderFn({ data: folderPayload(node.data as Folder, { description: newDescription }) })
				: updateIngredientFn({ data: ingredientPayload(node.data as Ingredient, { description: newDescription }) })
		)

	/** Move nós selecionados para uma pasta (null = raiz). Insumos → folder_id, pastas → parent_id. */
	const moveToFolder = (nodes: BulkSelectedNode[], targetFolderId: string | null) =>
		runBatch(nodes, (node) =>
			node.type === "folder"
				? updateFolderFn({ data: folderPayload(node.data as Folder, { parentId: targetFolderId }) })
				: updateIngredientFn({ data: ingredientPayload(node.data as Ingredient, { folderId: targetFolderId }) })
		)

	/** Define a unidade de medida em lote (apenas insumos). */
	const setMeasureUnit = (ingredients: BulkSelectedNode[], unit: string) =>
		runBatch(ingredients, (node) => updateIngredientFn({ data: ingredientPayload(node.data as Ingredient, { measureUnit: unit }) }))

	/** Define o fator de correção em lote (apenas insumos). */
	const setCorrectionFactor = (ingredients: BulkSelectedNode[], factor: number) =>
		runBatch(ingredients, (node) => updateIngredientFn({ data: ingredientPayload(node.data as Ingredient, { correctionFactor: factor }) }))

	/** Exclui (soft delete) nós selecionados. */
	const deleteNodes = (nodes: BulkSelectedNode[]) =>
		runBatch(nodes, (node) => (node.type === "folder" ? deleteFolderFn({ data: { id: node.id } }) : deleteIngredientFn({ data: { id: node.id } })))

	/** Restaura (deleted_at = null) nós selecionados. */
	const restoreNodes = (nodes: BulkSelectedNode[]) =>
		runBatch(nodes, (node) => (node.type === "folder" ? restoreFolderFn({ data: { id: node.id } }) : restoreIngredientFn({ data: { id: node.id } })))

	return {
		isRunning,
		progress,
		replaceDescriptions,
		moveToFolder,
		setMeasureUnit,
		setCorrectionFactor,
		deleteNodes,
		restoreNodes,
	}
}
