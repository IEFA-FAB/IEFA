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

import { normalizeForSearch, type SearchSensitivity } from "@/lib/text-search"

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
	 * Preparações já recortadas pelos filtros que NÃO são texto (origem, plano semanal,
	 * revisão, excluídas). A busca textual acontece aqui dentro porque ela também casa
	 * nome de PASTA — e isso só dá para decidir com a árvore na mão.
	 */
	recipes: readonly TRecipe[] | null | undefined
	/** Texto da busca; vazio desliga o filtro de texto. */
	filterText?: string
	/**
	 * Texto adicional que a busca também casa numa preparação, além do nome dela e do
	 * nome da pasta — o `rational_id` (código do SISUBWEB), por exemplo. Opcional porque
	 * nem toda tela expõe o código; quem não passa continua buscando só por nome.
	 */
	extraSearchText?: (recipe: TRecipe) => string | null | undefined
	sensitivity?: SearchSensitivity
	sortDirection?: "asc" | "desc"
	/**
	 * Pastas FECHADAS — o default do módulo é ABERTO, que é o que a árvore de seleção do
	 * planejamento (`RecipeSelector`) usa: lá a pasta nova nasce aberta em vez de herdar um
	 * "não estava na lista de abertas" e sumir com o conteúdo dentro.
	 *
	 * A listagem do catálogo (`RecipesManager`) quer o oposto — abre tudo recolhido — e
	 * passa o complemento de um conjunto de pastas ABERTAS. A inversão mora lá, na tela que
	 * a escolheu; aqui há uma semântica só.
	 */
	collapsedIds?: ReadonlySet<string>
	/** Abre tudo, ignorando `collapsedIds` — o que a busca textual faz. */
	autoExpand?: boolean
	/**
	 * Esconde pasta que ficou sem resultado. Vale para qualquer filtro restritivo (não só
	 * texto): sem isso, filtrar por uma origem sem correspondência devolve uma parede de
	 * pastas "0 preparações" e o estado vazio da tela nunca aparece.
	 */
	hideEmptyFolders?: boolean
}

export interface RecipeTree<TRecipe extends RecipeTreeRecipe = RecipeTreeRecipe> {
	/** Linhas na ordem de renderização (só o que está visível após expand/collapse). */
	nodes: RecipeTreeNode<TRecipe>[]
	/** Pastas reais renderizadas — o nó sintético "Sem pasta" não conta. */
	folderCount: number
	/** Preparações que passaram por todos os filtros, expandidas ou não. */
	recipeCount: number
	/** As mesmas preparações do `recipeCount`, para contagens e ações da tela. */
	matched: TRecipe[]
}

/** Normaliza um campo para array iterável — ver `asArray` em `lib/ingredient-tree`. */
const asArray = <T>(value: readonly T[] | null | undefined): readonly T[] => (Array.isArray(value) ? value : [])

export function buildRecipeTree<TRecipe extends RecipeTreeRecipe>(input: BuildRecipeTreeInput<TRecipe>): RecipeTree<TRecipe> {
	const folders = asArray(input.folders)
	const recipes = asArray(input.recipes)
	const sortDirection = input.sortDirection ?? "asc"
	const collapsedIds = input.collapsedIds ?? new Set<string>()
	const autoExpand = input.autoExpand ?? false
	const hideEmptyFolders = input.hideEmptyFolders ?? false

	const { caseSensitive = false, accentSensitive = false } = input.sensitivity ?? {}
	const norm = (value: string) => normalizeForSearch(value, { caseSensitive, accentSensitive })
	const filter = norm(input.filterText ?? "").trim()

	const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
	const dir = sortDirection === "desc" ? -1 : 1

	const folderById = new Map(folders.map((f) => [f.id, f]))
	// Pasta cujo NOME casa a busca: tudo que está dentro dela entra, mesmo que o nome da
	// preparação não case. É o que a árvore de insumos faz com os descendentes.
	const matchedFolderIds = new Set(filter ? folders.flatMap((f) => (norm(f.name).includes(filter) ? [f.id] : [])) : [])

	// Pasta excluída (ou de outro escopo) deixa a preparação órfã: ela vai para "Sem pasta"
	// em vez de sumir da listagem — antes da árvore, o filtro por pasta já tratava assim.
	const folderKeyOf = (recipe: TRecipe) => (recipe.folder_id && folderById.has(recipe.folder_id) ? recipe.folder_id : UNFILED_FOLDER_ID)

	const extraOf = input.extraSearchText
	const matchesText = (r: TRecipe) => {
		if (norm(r.name).includes(filter)) return true
		const extra = extraOf?.(r)
		return !!extra && norm(extra).includes(filter)
	}
	const matched = filter ? recipes.filter((r) => matchesText(r) || matchedFolderIds.has(folderKeyOf(r))) : [...recipes]

	const byFolder = new Map<string, TRecipe[]>()
	for (const recipe of matched) {
		const key = folderKeyOf(recipe)
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
		if (hideEmptyFolders && children.length === 0) return
		// O nó sintético só existe quando há preparação sem pasta.
		if (isUnfiled && children.length === 0) return

		const isExpanded = autoExpand || !collapsedIds.has(id)
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

	return { nodes, folderCount, recipeCount: matched.length, matched }
}

/** Ids de todas as pastas expansíveis — alimenta o "Recolher Tudo" da listagem. */
export function allRecipeFolderIds(folders: readonly RecipeTreeFolder[] | null | undefined): Set<string> {
	return new Set([...asArray(folders).map((f) => f.id), UNFILED_FOLDER_ID])
}
