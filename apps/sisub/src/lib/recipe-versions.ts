/**
 * Versões de preparação dentro de um cardápio (template semanal, plano global, evento, exceção).
 *
 * Editar uma preparação insere uma linha NOVA (`base_recipe_id` → raiz da linhagem) e a listagem
 * só devolve a vencedora de cada linhagem. O item de cardápio, porém, guarda o `recipe_id` da
 * versão que estava vigente quando foi montado. Resolver o nome do item contra a listagem fazia
 * o item de versão antiga sumir da tela — continuava no banco e na impressão, e quem colocava a
 * versão nova de novo acabava com a preparação duplicada na refeição.
 */

/** O mínimo de uma linha de `kitchen.recipes` para situar a versão na linhagem. */
export type RecipeVersionRef = {
	id: string
	name: string
	version: number
	kitchen_id: number | null
	base_recipe_id: string | null
	rational_id?: string | null
}

export function lineageRootOf(recipe: Pick<RecipeVersionRef, "id" | "base_recipe_id">): string {
	return recipe.base_recipe_id ?? recipe.id
}

/**
 * `candidate` substitui `current` na mesma linhagem? Espelha `lineageWinner` do domínio: a linha
 * local sombreia a global incondicionalmente; no mesmo escopo, vence a maior versão. Comparar só
 * o número daria "desatualizada" a um fork local diante do global — e sugeriria trocar a
 * adaptação da cozinha pelo original.
 */
export function isSupersededBy(current: RecipeVersionRef, candidate: RecipeVersionRef): boolean {
	if (current.id === candidate.id) return false
	if (lineageRootOf(current) !== lineageRootOf(candidate)) return false
	const candidateIsLocal = candidate.kitchen_id != null
	if (candidateIsLocal !== (current.kitchen_id != null)) return candidateIsLocal
	return candidate.version > current.version
}

/** Uma linha por linhagem — a listagem já vem deduplicada, mas o índice não depende disso. */
export function indexLatestByLineage(latest: readonly RecipeVersionRef[]): Map<string, RecipeVersionRef> {
	const byRoot = new Map<string, RecipeVersionRef>()
	for (const recipe of latest) {
		const root = lineageRootOf(recipe)
		const incumbent = byRoot.get(root)
		if (!incumbent || isSupersededBy(incumbent, recipe)) byRoot.set(root, recipe)
	}
	return byRoot
}

export type OutdatedRecipe = {
	current: RecipeVersionRef
	latest: RecipeVersionRef
	/** Quantos itens do cardápio usam a versão antiga (a mesma preparação em vários dias/refeições). */
	usageCount: number
}

/**
 * Preparações do cardápio que têm versão mais nova disponível, na ordem da primeira aparição.
 * `recipeIds` pode repetir (um id por item); ids sem linha conhecida são ignorados.
 */
export function findOutdatedRecipes(
	recipeIds: readonly string[],
	recipeById: ReadonlyMap<string, RecipeVersionRef>,
	latestByLineage: ReadonlyMap<string, RecipeVersionRef>
): OutdatedRecipe[] {
	const outdated = new Map<string, OutdatedRecipe>()
	for (const id of recipeIds) {
		const seen = outdated.get(id)
		if (seen) {
			seen.usageCount++
			continue
		}
		const current = recipeById.get(id)
		if (!current) continue
		const latest = latestByLineage.get(lineageRootOf(current))
		if (latest && isSupersededBy(current, latest)) outdated.set(id, { current, latest, usageCount: 1 })
	}
	return [...outdated.values()]
}

type CellItem = { day_of_week: number; meal_type_id: string; recipe_id: string }

/**
 * Troca o `recipe_id` dos itens pelas versões novas (`replacements`: id antigo → id novo).
 *
 * Se a refeição já tem a versão nova, o item antigo SAI em vez de virar uma segunda cópia: é
 * exatamente a duplicata que a versão invisível produzia. Fica o item que já estava na versão
 * nova, com o efetivo, grupo e proporção que o usuário deu a ele.
 */
export function replaceRecipeVersions<T extends CellItem>(items: readonly T[], replacements: ReadonlyMap<string, string>): T[] {
	const cellKey = (item: CellItem, recipeId: string) => `${item.day_of_week}|${item.meal_type_id}|${recipeId}`
	const taken = new Set(items.filter((item) => !replacements.has(item.recipe_id)).map((item) => cellKey(item, item.recipe_id)))

	const result: T[] = []
	for (const item of items) {
		const nextId = replacements.get(item.recipe_id)
		if (nextId === undefined) {
			result.push(item)
			continue
		}
		const key = cellKey(item, nextId)
		if (taken.has(key)) continue
		taken.add(key)
		result.push({ ...item, recipe_id: nextId })
	}
	return result
}
