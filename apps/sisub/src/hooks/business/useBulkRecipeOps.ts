import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { queryKeys } from "@/lib/query-keys"
import { createRecipeFn, deleteRecipeFn, renameRecipeFn, restoreRecipeFn, setRecipeFolderFn } from "@/server/recipes.fn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

/** Receita selecionada para edição em massa — carrega os dados completos (com ingredientes para fork). */
export interface BulkSelectedRecipe {
	id: string
	name: string
	/** null = global (SDAB); non-null = local de uma cozinha. */
	kitchenId: number | null
	data: RecipeWithIngredients
}

export interface BulkResult {
	done: number
	failed: number
}

export interface BulkProgress {
	total: number
	completed: number
}

/** Requisições concorrentes por lote (evita estourar o servidor). */
const CONCURRENCY = 5

/** Teto de ids por requisição de arquivamento — espelha o `max(500)` de `SetRecipeFolderSchema`. */
const FOLDER_BATCH_SIZE = 500

/**
 * Orquestra operações de edição em massa sobre receitas.
 * Faz lote no cliente (pool de concorrência) e invalida a lista ao final.
 */
export function useBulkRecipeOps() {
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
			await queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() })
		} finally {
			setIsRunning(false)
			setProgress(null)
		}

		return { done: completed - failed, failed }
	}

	/** Exclui (soft delete) receitas selecionadas. */
	const deleteRecipes = (recipes: BulkSelectedRecipe[]) => runBatch(recipes, (r) => deleteRecipeFn({ data: { id: r.id } }))

	/** Restaura (deleted_at = null) receitas selecionadas. */
	const restoreRecipes = (recipes: BulkSelectedRecipe[]) => runBatch(recipes, (r) => restoreRecipeFn({ data: { id: r.id } }))

	/** Cria cópias locais (na cozinha alvo) das receitas selecionadas, copiando ingredientes. */
	const forkRecipes = (recipes: BulkSelectedRecipe[], kitchenId: number) =>
		runBatch(recipes, (r) =>
			createRecipeFn({
				data: {
					name: r.data.name,
					preparationMethod: r.data.preparation_method ?? undefined,
					prePreparationMethod: r.data.pre_preparation_method ?? undefined,
					portionYield: r.data.portion_yield ?? 1,
					preparationTimeMinutes: r.data.preparation_time_minutes ?? undefined,
					cookingFactor: r.data.cooking_factor ?? undefined,
					rationalId: r.data.rational_id ?? undefined,
					kitchenId,
					ingredients: (r.data.ingredients ?? [])
						.filter((ing): ing is typeof ing & { ingredient_id: string; net_quantity: number } => ing.ingredient_id != null && ing.net_quantity != null)
						.map((ing) => ({
							ingredientId: ing.ingredient_id,
							netQuantity: ing.net_quantity,
							isOptional: ing.is_optional ?? false,
							priorityOrder: ing.priority_order ?? 0,
						})),
				},
			})
		)

	/** Renomeia receitas em lote (localizar e substituir nos nomes). */
	const replaceNames = (edits: { id: string; newName: string }[]) => runBatch(edits, (e) => renameRecipeFn({ data: { id: e.id, name: e.newName } }))

	/**
	 * Arquiva as preparações selecionadas numa pasta (`folderId: null` = tira da pasta).
	 *
	 * Não usa `runBatch`: a operação de domínio recebe o lote inteiro e autoriza TODAS as
	 * preparações antes de escrever qualquer uma — mandar uma requisição por item
	 * reintroduziria a aplicação parcial que ela evita. Seleções acima do teto do schema são
	 * fatiadas em requisições sequenciais (cada fatia continua atômica).
	 */
	const moveToFolder = async (recipes: BulkSelectedRecipe[], folderId: string | null): Promise<BulkResult> => {
		if (recipes.length === 0) return { done: 0, failed: 0 }

		setIsRunning(true)
		setProgress({ total: recipes.length, completed: 0 })

		let done = 0
		let completed = 0
		try {
			for (let i = 0; i < recipes.length; i += FOLDER_BATCH_SIZE) {
				const chunk = recipes.slice(i, i + FOLDER_BATCH_SIZE)
				try {
					const result = await setRecipeFolderFn({ data: { recipeIds: chunk.map((r) => r.id), folderId } })
					done += result.updated
				} catch {
					// Fatia inteira recusada (ex.: sem nível na cozinha dona de alguma delas).
				}
				completed += chunk.length
				setProgress({ total: recipes.length, completed })
			}
			await queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() })
		} finally {
			setIsRunning(false)
			setProgress(null)
		}

		return { done, failed: recipes.length - done }
	}

	return {
		isRunning,
		progress,
		deleteRecipes,
		restoreRecipes,
		forkRecipes,
		replaceNames,
		moveToFolder,
	}
}
