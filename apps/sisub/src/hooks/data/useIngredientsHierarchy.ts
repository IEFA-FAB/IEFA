import { useEffect, useMemo, useRef } from "react"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { normalizeForSearch, type SearchSensitivity } from "@/lib/text-search"
import { useIngredientsTree } from "@/services/IngredientsService"
import type { FlatIngredientTree, IngredientTreeNode } from "@/types/domain/ingredients"

/**
 * Categorias de "busca rápida": grandes grupos de pastas que podem ser ocultados
 * para limpar a árvore. Identificadas pela descrição da pasta raiz do grupo
 * (a base não possui flag — o agrupamento é por pasta). Ocultar uma categoria
 * remove a pasta raiz e toda a sua subárvore (subpastas + insumos).
 */
export const QUICK_FILTER_CATEGORIES = [
	{ key: "preparacoes", label: "Preparações", match: (d: string) => /^prepara[çc][õo]es/i.test(d) },
	{ key: "pratos-prontos", label: "Pratos Prontos", match: (d: string) => /^pratos?\s+prontos?/i.test(d) },
	{ key: "lanches-prontos", label: "Lanches Prontos", match: (d: string) => /^lanches?\s+prontos?/i.test(d) },
] as const

export type QuickFilterKey = (typeof QUICK_FILTER_CATEGORIES)[number]["key"]

/**
 * Hook avançado que orquestra os dados de ingredientes
 * Gerencia estado de filtro, árvore hierárquica e virtualização
 *
 * Segue padrão: hooks/ orquestram múltiplos services e gerenciam estado de UI
 *
 * @param persistKey quando informado, o estado de expand/collapse é persistido
 *   em `sessionStorage` (preserva as pastas abertas ao navegar e voltar). Omitir
 *   em usos efêmeros (ex: IngredientSelector) para manter o comportamento padrão.
 */
export function useIngredientsHierarchy(
	filterText = "",
	includeDeleted = false,
	persistKey?: string,
	sensitivity: SearchSensitivity = { caseSensitive: false, accentSensitive: false },
	hiddenCategoryKeys: readonly string[] = []
) {
	const { caseSensitive, accentSensitive } = sensitivity
	// Chave estável (ordenada) para o memo: ocultação de categorias por pasta raiz.
	const hiddenKey = useMemo(() => [...hiddenCategoryKeys].sort().join(","), [hiddenCategoryKeys])
	// Busca dados via service
	const { tree, error, refetch } = useIngredientsTree(includeDeleted)

	// Estado de expand/collapse
	// Inicializa com todas as pastas de primeiro nível expandidas.
	// Usa ref para garantir que a inicialização ocorra somente uma vez,
	// mesmo que `tree` chegue de forma assíncrona (ex: IngredientSelector sem loader).
	const [expandedIds, setExpandedIds, expandMeta] = usePersistentState<Set<string>>(persistKey ? `${persistKey}:expanded` : null, new Set(), {
		serialize: (s) => JSON.stringify([...s]),
		deserialize: (raw) => new Set(JSON.parse(raw) as string[]),
	})
	const initializedRef = useRef(false)

	useEffect(() => {
		// Aguarda a hidratação do storage para saber se há um estado salvo.
		if (!expandMeta.hydrated) return
		if (tree && !initializedRef.current) {
			initializedRef.current = true
			// Havia estado salvo (inclui "tudo recolhido") → respeita, não reexpande.
			if (expandMeta.hadStored) return
			const rootFolders = (tree.folders ?? []).filter((f) => !f.parent_id).map((f) => f.id)
			setExpandedIds(new Set(rootFolders))
		}
	}, [tree, expandMeta.hydrated, expandMeta.hadStored, setExpandedIds])

	// Funções de controle de expansão
	const toggleExpand = (nodeId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(nodeId)) {
				next.delete(nodeId)
			} else {
				next.add(nodeId)
			}
			return next
		})
	}

	const expandAll = () => {
		if (!tree) return
		// Ingredients are leaf nodes (items live on detail page), only expand folders
		setExpandedIds(new Set(tree.folders.map((f) => f.id)))
	}

	const collapseAll = () => {
		setExpandedIds(new Set())
	}

	// Contagem de itens de compra por ingrediente (para badges na árvore)
	const itemCountByIngredientId = useMemo<Record<string, number>>(() => {
		if (!tree) return {}
		const counts: Record<string, number> = {}
		for (const item of tree.ingredientItems ?? []) {
			if (item.ingredient_id) {
				counts[item.ingredient_id] = (counts[item.ingredient_id] || 0) + 1
			}
		}
		return counts
	}, [tree])

	// Data da última revisão por ingrediente (ISO) — exibida na árvore para acompanhar a conferência.
	const lastReviewByIngredientId = useMemo<Record<string, string>>(() => {
		if (!tree) return {}
		const map: Record<string, string> = {}
		for (const r of tree.lastReviews ?? []) {
			if (r.ingredient_id) map[r.ingredient_id] = r.reviewed_at
		}
		return map
	}, [tree])

	// Constrói estrutura flat da árvore para virtualização
	// Agora com suporte a expand/collapse
	const flatTree = useMemo<FlatIngredientTree | null>(() => {
		if (!tree) return null

		const folders = tree.folders ?? []
		const ingredients = tree.ingredients ?? []

		const norm = (value: string) => normalizeForSearch(value, { caseSensitive, accentSensitive })
		const filter = norm(filterText).trim()
		const isFiltering = !!filter

		// Lookup de pastas por ID para traversal de ancestrais
		const folderById: Record<string, (typeof folders)[0]> = {}
		folders.forEach((f) => {
			folderById[f.id] = f
		})

		// Categorias ocultas (busca rápida): coleta a pasta raiz que casa a descrição
		// e toda a sua subárvore. Nós dentro desse conjunto são removidos da árvore.
		const excludedFolderIds = new Set<string>()
		if (hiddenKey) {
			const matchers = QUICK_FILTER_CATEGORIES.filter((c) => hiddenKey.split(",").includes(c.key))
			const childFolderIdsByParent: Record<string, string[]> = {}
			folders.forEach((f) => {
				;(childFolderIdsByParent[f.parent_id || "root"] ??= []).push(f.id)
			})
			const stack = folders.filter((f) => matchers.some((m) => m.match(f.description || ""))).map((f) => f.id)
			while (stack.length > 0) {
				const id = stack.pop()
				if (!id || excludedFolderIds.has(id)) continue
				excludedFolderIds.add(id)
				for (const childId of childFolderIdsByParent[id] ?? []) stack.push(childId)
			}
		}
		const isFolderExcluded = (id: string) => excludedFolderIds.has(id)
		const isIngredientExcluded = (folderId: string | null) => !!folderId && excludedFolderIds.has(folderId)

		// Ao filtrar: pré-computar quais IDs devem aparecer
		// Regra: nó que bate + todos os seus ancestrais
		const includedIds = new Set<string>()

		if (isFiltering) {
			// Índices filho→pai para traversal descendente (subpastas e insumos por pasta)
			const childFoldersByParent: Record<string, string[]> = {}
			folders.forEach((f) => {
				const key = f.parent_id || "root"
				;(childFoldersByParent[key] ??= []).push(f.id)
			})
			const ingredientsByFolder: Record<string, string[]> = {}
			ingredients.forEach((i) => {
				const key = i.folder_id || "root"
				;(ingredientsByFolder[key] ??= []).push(i.id)
			})

			const addWithAncestors = (startFolderId: string | null) => {
				let id = startFolderId
				while (id) {
					if (includedIds.has(id)) break // ancestral já adicionado, parar
					includedIds.add(id)
					id = folderById[id]?.parent_id ?? null
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
						includedIds.add(ingredientId)
					}
				}
			}

			ingredients.forEach((ingredient) => {
				if (isIngredientExcluded(ingredient.folder_id)) return
				const description = ingredient.description || "Sem descrição"
				if (norm(description).includes(filter)) {
					includedIds.add(ingredient.id)
					addWithAncestors(ingredient.folder_id)
				}
			})

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

		const byId: Record<string, IngredientTreeNode> = {}
		const byParentId: Record<string, IngredientTreeNode[]> = {}

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

			const parentKey = folder.parent_id || "root"
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

			const parentKey = ingredient.folder_id || "root"
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
	}, [tree, filterText, expandedIds, caseSensitive, accentSensitive, hiddenKey])

	// Estatísticas
	const stats = useMemo(() => {
		if (!tree) return null

		return {
			totalFolders: (tree.folders ?? []).length,
			totalIngredients: (tree.ingredients ?? []).length,
			totalItems: (tree.ingredientItems ?? []).length,
		}
	}, [tree])

	return {
		// Dados
		flatTree,
		stats,
		itemCountByIngredientId,
		lastReviewByIngredientId,

		// Estados (componente decide skeleton)
		error,

		// Estado de expansão
		expandedIds,

		// Ações
		refetch,
		toggleExpand,
		expandAll,
		collapseAll,
	}
}
