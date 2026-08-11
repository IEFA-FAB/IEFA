/**
 * Montagem da árvore de insumos: dados crus (pastas + insumos) → estrutura flat
 * para virtualização.
 *
 * Função PURA, fora do hook, porque é aqui que mora a lógica que quebra: recorte
 * de escopo, filtro de texto com ancestrais, filtro de conferência, ordenação,
 * expand/collapse e — o que já causou uma tela vazia em produção — a decisão de
 * quem é raiz. Enquanto isso vivia num `useMemo`, nada disso tinha teste.
 *
 * Ver `ingredient-tree.test.ts`.
 */

import { normalizeForSearch, type SearchSensitivity } from "@/lib/text-search"
import type { FlatIngredientTree, Folder, Ingredient, IngredientTreeNode } from "@/types/domain/ingredients"

/**
 * Categorias de "busca rápida": grandes grupos de pastas que podem ser ocultados
 * para limpar a árvore. Identificadas pela descrição da pasta raiz do grupo
 * (a base não possui flag — o agrupamento é por pasta). Ocultar uma categoria
 * remove a pasta raiz e toda a sua subárvore (subpastas + insumos).
 *
 * "Preparações" NÃO está aqui: aquele grupo não é insumo, e por isso deixou de ser
 * uma preferência de visualização para virar escopo de leitura no servidor
 * (`preparations: "exclude"`, ver `preparation-scope.ts` no domínio). Ele tem aba
 * própria em `/global/ingredients?tab=preparacoes`. Como chip, um clique errado
 * devolvia à árvore nomes que colidem com os das receitas.
 */
export const QUICK_FILTER_CATEGORIES = [
	{ key: "pratos-prontos", label: "Pratos Prontos", match: (d: string) => /^pratos?\s+prontos?/i.test(d) },
	{ key: "lanches-prontos", label: "Lanches Prontos", match: (d: string) => /^lanches?\s+prontos?/i.test(d) },
] as const

export type QuickFilterKey = (typeof QUICK_FILTER_CATEGORIES)[number]["key"]

/**
 * Normaliza um campo da árvore para array iterável. Um server fn pode resolver
 * com um objeto não-array (ex: envelope de erro materializado pelo client em
 * vez de rejeitar) — `?? []` só cobre null/undefined, então `for...of`/spread
 * sobre esse objeto lançaria "object is not iterable". `asArray` garante array.
 *
 * O parâmetro é tipado como `readonly T[]` (o formato *esperado*, que preserva a
 * inferência de `T` nos call sites) enquanto o `Array.isArray` defende, em runtime,
 * contra qualquer outro formato inesperado — não só `null`/`undefined`.
 */
export const asArray = <T>(value: readonly T[] | null | undefined): readonly T[] => (Array.isArray(value) ? value : [])

/** Só o que a montagem precisa de uma revisão — o resto do registro é irrelevante aqui. */
export interface TreeLastReview {
	ingredient_id: string | null
	reviewed_at: string
}

export interface BuildIngredientTreeInput {
	folders: readonly Folder[] | null | undefined
	ingredients: readonly Ingredient[] | null | undefined
	/** Última conferência por insumo — só consumida quando `onlyNotReviewed`. */
	lastReviews?: readonly TreeLastReview[] | null
	/** Texto da busca; vazio desliga o filtro de texto. */
	filterText?: string
	sensitivity?: SearchSensitivity
	/** Chaves de `QUICK_FILTER_CATEGORIES` cujas subárvores devem sumir. */
	hiddenCategoryKeys?: readonly string[]
	sortDirection?: "asc" | "desc"
	/** Mostra apenas insumos nunca conferidos. */
	onlyNotReviewed?: boolean
	/** Pastas abertas. Sob filtro, tudo abre automaticamente e este conjunto é ignorado. */
	expandedIds?: ReadonlySet<string>
}

/**
 * Pastas presas num ciclo de `parent_id`.
 *
 * A FK auto-referente não impede ciclo, e um ciclo não tem caminho até a raiz: sem
 * promover seus membros a raiz, o grupo inteiro (e tudo pendurado nele) fica
 * inalcançável pelo traversal — some da tela sem erro nenhum. Colorização iterativa
 * (branco/cinza/preto) com memo: O(N), sem recursão e sem revisitar caminho.
 */
function findCyclicFolders(renderedFolderIds: ReadonlySet<string>, parentOf: (id: string) => string | null): Set<string> {
	const VISITING = 1
	const DONE = 2
	const color = new Map<string, number>()
	const cyclic = new Set<string>()

	for (const start of renderedFolderIds) {
		if (color.has(start)) continue
		const path: string[] = []
		let current: string | null = start
		while (current && renderedFolderIds.has(current) && !color.has(current)) {
			color.set(current, VISITING)
			path.push(current)
			current = parentOf(current)
		}
		// Parou num nó ainda cinza ⇒ fechou ciclo dentro deste caminho.
		if (current && color.get(current) === VISITING) {
			for (let i = path.indexOf(current); i < path.length; i++) cyclic.add(path[i])
		}
		for (const id of path) color.set(id, DONE)
	}
	return cyclic
}

export function buildIngredientTree(input: BuildIngredientTreeInput): FlatIngredientTree {
	const folders = asArray(input.folders)
	const ingredients = asArray(input.ingredients)
	const { caseSensitive = false, accentSensitive = false } = input.sensitivity ?? {}
	const sortDirection = input.sortDirection ?? "asc"
	const onlyNotReviewed = input.onlyNotReviewed ?? false
	const expandedIds = input.expandedIds ?? new Set<string>()
	const hiddenCategoryKeys = input.hiddenCategoryKeys ?? []

	const norm = (value: string) => normalizeForSearch(value, { caseSensitive, accentSensitive })
	const filter = norm(input.filterText ?? "").trim()
	const isTextFiltering = !!filter
	// O filtro de revisão restringe insumos (folhas); combina com o texto por interseção.
	const isFiltering = isTextFiltering || onlyNotReviewed

	// Insumos já revisados ao menos uma vez — excluídos quando "somente não revisados" está ativo.
	const reviewedIngredientIds = new Set<string>()
	if (onlyNotReviewed) {
		for (const r of asArray(input.lastReviews)) {
			if (r.ingredient_id) reviewedIngredientIds.add(r.ingredient_id)
		}
	}

	// Lookup de pastas por ID para traversal de ancestrais
	const folderById: Record<string, Folder> = {}
	folders.forEach((f) => {
		folderById[f.id] = f
	})
	const parentOf = (id: string): string | null => folderById[id]?.parent_id ?? null

	const childFoldersByParent: Record<string, string[]> = {}
	folders.forEach((f) => {
		const key = f.parent_id || "root"
		if (!childFoldersByParent[key]) childFoldersByParent[key] = []
		childFoldersByParent[key].push(f.id)
	})

	// Categorias ocultas (busca rápida): coleta a pasta raiz que casa a descrição
	// e toda a sua subárvore. Nós dentro desse conjunto são removidos da árvore.
	const excludedFolderIds = new Set<string>()
	if (hiddenCategoryKeys.length > 0) {
		const matchers = QUICK_FILTER_CATEGORIES.filter((c) => hiddenCategoryKeys.includes(c.key))
		const stack = folders.flatMap((f) => (matchers.some((m) => m.match(f.description || "")) ? [f.id] : []))
		while (stack.length > 0) {
			const id = stack.pop()
			if (!id || excludedFolderIds.has(id)) continue
			excludedFolderIds.add(id)
			for (const childId of childFoldersByParent[id] ?? []) stack.push(childId)
		}
	}
	const isFolderExcluded = (id: string) => excludedFolderIds.has(id)
	const isIngredientExcluded = (folderId: string | null) => !!folderId && excludedFolderIds.has(folderId)

	// Ao filtrar: pré-computar quais IDs devem aparecer
	// Regra: nó que bate + todos os seus ancestrais
	const includedIds = new Set<string>()

	if (isFiltering) {
		const ingredientsByFolder: Record<string, string[]> = {}
		ingredients.forEach((i) => {
			const key = i.folder_id || "root"
			if (!ingredientsByFolder[key]) ingredientsByFolder[key] = []
			ingredientsByFolder[key].push(i.id)
		})

		const addWithAncestors = (startFolderId: string | null) => {
			let id = startFolderId
			while (id) {
				if (includedIds.has(id)) break // ancestral já adicionado, parar (também quebra ciclo)
				includedIds.add(id)
				id = parentOf(id)
			}
		}

		// Quando uma pasta casa o filtro, inclui TODO o seu conteúdo
		// (subpastas + insumos, recursivamente). Sem isso a pasta apareceria vazia.
		const addDescendants = (folderId: string) => {
			const stack = [folderId]
			while (stack.length > 0) {
				const fid = stack.pop()
				if (!fid) continue
				for (const childFolderId of childFoldersByParent[fid] ?? []) {
					if (includedIds.has(childFolderId)) continue
					includedIds.add(childFolderId)
					stack.push(childFolderId)
				}
				for (const ingredientId of ingredientsByFolder[fid] ?? []) {
					if (onlyNotReviewed && reviewedIngredientIds.has(ingredientId)) continue
					includedIds.add(ingredientId)
				}
			}
		}

		ingredients.forEach((ingredient) => {
			if (isIngredientExcluded(ingredient.folder_id)) return
			if (onlyNotReviewed && reviewedIngredientIds.has(ingredient.id)) return
			const description = ingredient.description || "Sem descrição"
			if (!isTextFiltering || norm(description).includes(filter)) {
				includedIds.add(ingredient.id)
				addWithAncestors(ingredient.folder_id)
			}
		})

		// Pastas só casam por texto; o filtro de revisão é escopo de insumo (folha).
		// Quando uma pasta casa o texto, seus descendentes entram via addDescendants
		// (que já pula insumos revisados sob o filtro de revisão).
		if (isTextFiltering) {
			folders.forEach((folder) => {
				if (isFolderExcluded(folder.id)) return
				const description = folder.description || `Pasta ${folder.id.substring(0, 8)}...`
				if (norm(description).includes(filter)) {
					includedIds.add(folder.id)
					addWithAncestors(folder.parent_id)
					addDescendants(folder.id)
				}
			})
		}
	}

	// Ordenação alfabética dos filhos de cada nó (pastas primeiro, depois insumos),
	// respeitando a hierarquia: cada grupo `byParentId` é ordenado independentemente.
	const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
	const dir = sortDirection === "desc" ? -1 : 1
	const compareNodes = (a: IngredientTreeNode, b: IngredientTreeNode) => {
		if (a.type !== b.type) return a.type === "folder" ? -1 : 1
		return dir * collator.compare(a.label, b.label)
	}

	const byId: Record<string, IngredientTreeNode> = {}
	const byParentId: Record<string, IngredientTreeNode[]> = {}

	/**
	 * Pastas que de fato entram na árvore, depois de escopo e filtro.
	 *
	 * O traversal parte de `byParentId["root"]`, então um nó cujo pai NÃO está aqui
	 * precisa virar raiz — senão fica órfão e nunca é visitado. Acontece em dois casos
	 * reais: o recorte não alcança a raiz original (a aba "Preparações" tem uma
	 * pasta-topo que é filha de uma pasta fora do recorte, e a árvore inteira sumia
	 * por isso), e a pasta-pai está soft-deleted enquanto os filhos não estão.
	 */
	const renderedFolderIds = new Set(folders.flatMap((f) => (!isFolderExcluded(f.id) && (!isFiltering || includedIds.has(f.id)) ? [f.id] : [])))
	const cyclicFolderIds = findCyclicFolders(renderedFolderIds, parentOf)
	const parentKeyOf = (childId: string, parentId: string | null) =>
		parentId && renderedFolderIds.has(parentId) && !cyclicFolderIds.has(childId) ? parentId : "root"

	// 1. Criar todos os nós
	folders.forEach((folder) => {
		if (isFolderExcluded(folder.id)) return
		if (isFiltering && !includedIds.has(folder.id)) return

		const description = folder.description || `Pasta ${folder.id.substring(0, 8)}...`
		const node: IngredientTreeNode = {
			id: folder.id,
			type: "folder",
			label: description,
			parentId: folder.parent_id,
			level: 0,
			hasChildren: false, // será atualizado após construir byParentId
			// Ao filtrar, expandir tudo automaticamente para mostrar resultados
			isExpanded: isFiltering ? true : expandedIds.has(folder.id),
			data: folder,
		}

		byId[folder.id] = node

		const parentKey = parentKeyOf(folder.id, folder.parent_id)
		if (!byParentId[parentKey]) {
			byParentId[parentKey] = []
		}
		byParentId[parentKey].push(node)
	})

	ingredients.forEach((ingredient) => {
		if (isIngredientExcluded(ingredient.folder_id)) return
		if (isFiltering && !includedIds.has(ingredient.id)) return

		const description = ingredient.description || "Sem descrição"
		const node: IngredientTreeNode = {
			id: ingredient.id,
			type: "ingredient",
			label: description,
			parentId: ingredient.folder_id,
			level: 1,
			// Ingredientes são folhas: itens de compra vivem na página de detalhe
			hasChildren: false,
			isExpanded: false,
			data: ingredient,
		}

		byId[ingredient.id] = node

		// Insumo nunca está num ciclo (é folha), então o próprio id não muda a decisão.
		const parentKey = parentKeyOf(ingredient.id, ingredient.folder_id)
		if (!byParentId[parentKey]) {
			byParentId[parentKey] = []
		}
		byParentId[parentKey].push(node)
	})

	// ingredient_items não são adicionados à árvore —
	// eles vivem em /global/ingredients/$ingredientId

	// 2. Atualizar hasChildren + calcular níveis em O(N) via DFS a partir da raiz.
	// Evita o antigo calculateLevel recursivo que era O(N × profundidade).
	const visibleNodes: IngredientTreeNode[] = []

	// Ordena os filhos de cada nó antes do traversal (pastas A-Z/Z-A, depois insumos A-Z/Z-A).
	for (const key of Object.keys(byParentId)) {
		byParentId[key].sort(compareNodes)
	}

	const traverse = (parentId: string | null, level: number) => {
		const children = byParentId[parentId || "root"] || []

		for (const node of children) {
			node.level = level
			if (node.type === "folder") {
				node.hasChildren = !!byParentId[node.id]?.length
			}

			visibleNodes.push(node)

			// Ao filtrar, pastas estão todas expandidas; senão respeita expandedIds
			if (node.type === "folder" && (isFiltering || expandedIds.has(node.id))) {
				traverse(node.id, level + 1)
			}
		}
	}

	traverse(null, 0)

	return { nodes: visibleNodes, byId, byParentId }
}
