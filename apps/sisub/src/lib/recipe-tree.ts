/**
 * Montagem da árvore de preparações: pastas + preparações → estrutura flat para
 * virtualização. Espelha `lib/ingredient-tree`, e pelo mesmo motivo: a lógica que
 * decide o que aparece na tela precisa ser pura para ter teste.
 *
 * Diferença estrutural em relação aos insumos: `recipe_folder` é uma lista PLANA
 * (sem `parent_id`), então a árvore tem no máximo dois níveis — pasta e preparação.
 * Não há ciclo, órfão nem ancestral para resolver.
 *
 * Ver `recipe-tree.test.ts`.
 */

/** Nó-pasta sintético das preparações sem pasta. Não existe no banco. */
export const UNFILED_FOLDER_ID = "__sem-pasta__"

export const UNFILED_FOLDER_LABEL = "Sem pasta"

/** Só o que a montagem precisa de uma pasta. */
export interface RecipeTreeFolder {
	id: string
	name: string
}

/** Só o que a montagem precisa de uma preparação — o nó carrega o registro inteiro. */
export interface RecipeTreeRecipe {
	id: string
	name: string
	folder_id: string | null
}

export type RecipeTreeNode<TRecipe extends RecipeTreeRecipe = RecipeTreeRecipe> =
	| {
			type: "folder"
			id: string
			label: string
			level: 0
			hasChildren: boolean
			isExpanded: boolean
			/** Quantas preparações estão nesta pasta (após os filtros já aplicados). */
			recipeCount: number
			/** `true` no nó sintético "Sem pasta" — não tem registro por trás. */
			isUnfiled: boolean
	  }
	| {
			type: "recipe"
			id: string
			label: string
			level: 1
			/** Id da pasta que renderizou este nó (ou `UNFILED_FOLDER_ID`). */
			parentId: string
			data: TRecipe
	  }

export interface BuildRecipeTreeInput<TRecipe extends RecipeTreeRecipe> {
	folders: readonly RecipeTreeFolder[] | null | undefined
	/**
	 * Preparações JÁ filtradas (busca, origem, revisão, excluídas). O recorte por
	 * texto acontece antes, em `useRecipes` — aqui só entra o agrupamento.
	 */
	recipes: readonly TRecipe[] | null | undefined
	sortDirection?: "asc" | "desc"
	/** Pastas abertas. Sob filtro, tudo abre e este conjunto é ignorado. */
	expandedIds?: ReadonlySet<string>
	/**
	 * Há filtro ativo na listagem. Muda dois comportamentos, como na árvore de insumos:
	 * tudo abre, e pasta que ficou sem resultado some (senão o filtro devolve uma parede
	 * de pastas vazias).
	 */
	isFiltering?: boolean
}

export interface RecipeTree<TRecipe extends RecipeTreeRecipe = RecipeTreeRecipe> {
	/** Linhas na ordem de renderização (só o que está visível após expand/collapse). */
	nodes: RecipeTreeNode<TRecipe>[]
	/** Pastas reais renderizadas — o nó sintético "Sem pasta" não conta. */
	folderCount: number
	/** Total de preparações no recorte, expandidas ou não. */
	recipeCount: number
}

/** Normaliza um campo para array iterável — ver `asArray` em `lib/ingredient-tree`. */
const asArray = <T>(value: readonly T[] | null | undefined): readonly T[] => (Array.isArray(value) ? value : [])

export function buildRecipeTree<TRecipe extends RecipeTreeRecipe>(input: BuildRecipeTreeInput<TRecipe>): RecipeTree<TRecipe> {
	const folders = asArray(input.folders)
	const recipes = asArray(input.recipes)
	const sortDirection = input.sortDirection ?? "asc"
	const expandedIds = input.expandedIds ?? new Set<string>()
	const isFiltering = input.isFiltering ?? false

	const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
	const dir = sortDirection === "desc" ? -1 : 1

	const folderIds = new Set(folders.map((f) => f.id))

	// Pasta excluída (ou de outro escopo) deixa a preparação órfã: ela vai para "Sem pasta"
	// em vez de sumir da listagem — antes da árvore, o filtro por pasta já tratava assim.
	const byFolder = new Map<string, TRecipe[]>()
	for (const recipe of recipes) {
		const key = recipe.folder_id && folderIds.has(recipe.folder_id) ? recipe.folder_id : UNFILED_FOLDER_ID
		const bucket = byFolder.get(key)
		if (bucket) bucket.push(recipe)
		else byFolder.set(key, [recipe])
	}

	const orderedFolders = folders.toSorted((a, b) => dir * collator.compare(a.name, b.name))

	const nodes: RecipeTreeNode<TRecipe>[] = []
	let folderCount = 0

	const pushFolder = (id: string, label: string, isUnfiled: boolean) => {
		const children = byFolder.get(id) ?? []
		// Sob filtro, pasta vazia é ruído: some. Sem filtro, ela precisa aparecer —
		// é onde se arquiva uma preparação, e uma pasta recém-criada nasce vazia.
		if (isFiltering && children.length === 0) return
		// O nó sintético só existe quando há preparação sem pasta.
		if (isUnfiled && children.length === 0) return

		const isExpanded = isFiltering || expandedIds.has(id)
		nodes.push({
			type: "folder",
			id,
			label,
			level: 0,
			hasChildren: children.length > 0,
			isExpanded,
			recipeCount: children.length,
			isUnfiled,
		})
		if (!isUnfiled) folderCount++

		if (!isExpanded) return
		for (const recipe of children.toSorted((a, b) => dir * collator.compare(a.name, b.name))) {
			nodes.push({ type: "recipe", id: recipe.id, label: recipe.name, level: 1, parentId: id, data: recipe })
		}
	}

	for (const folder of orderedFolders) pushFolder(folder.id, folder.name, false)
	// "Sem pasta" fica sempre por último, nas duas direções de ordenação: é o resto,
	// não um nome que participa da ordem alfabética.
	pushFolder(UNFILED_FOLDER_ID, UNFILED_FOLDER_LABEL, true)

	return { nodes, folderCount, recipeCount: recipes.length }
}

/** Ids de todas as pastas expansíveis — alimenta o "Expandir Tudo" da listagem. */
export function allRecipeFolderIds(folders: readonly RecipeTreeFolder[] | null | undefined): Set<string> {
	return new Set([...asArray(folders).map((f) => f.id), UNFILED_FOLDER_ID])
}
