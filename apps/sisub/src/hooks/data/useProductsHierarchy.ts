import { useEffect, useMemo, useRef, useState } from "react"
import { useProductsTree } from "@/services/ProductsService"
import type { FlatProductTree, ProductTreeNode } from "@/types/domain/products"

/**
 * Hook avançado que orquestra os dados de produtos
 * Gerencia estado de filtro, árvore hierárquica e virtualização
 *
 * Segue padrão: hooks/ orquestram múltiplos services e gerenciam estado de UI
 */
export function useProductsHierarchy(filterText = "") {
	// Busca dados via service
	const { tree, error, refetch } = useProductsTree()

	// Estado de expand/collapse
	// Inicializa com todas as pastas de primeiro nível expandidas.
	// Usa ref para garantir que a inicialização ocorra somente uma vez,
	// mesmo que `tree` chegue de forma assíncrona (ex: IngredientSelector sem loader).
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const initializedRef = useRef(false)

	useEffect(() => {
		if (tree && !initializedRef.current) {
			initializedRef.current = true
			const rootFolders = tree.folders.filter((f) => !f.parent_id).map((f) => f.id)
			setExpandedIds(new Set(rootFolders))
		}
	}, [tree])

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
		// Products are leaf nodes (items live on detail page), only expand folders
		setExpandedIds(new Set(tree.folders.map((f) => f.id)))
	}

	const collapseAll = () => {
		setExpandedIds(new Set())
	}

	// Contagem de itens de compra por produto (para badges na árvore)
	const itemCountByProductId = useMemo<Record<string, number>>(() => {
		if (!tree) return {}
		const counts: Record<string, number> = {}
		for (const item of tree.productItems) {
			if (item.product_id) {
				counts[item.product_id] = (counts[item.product_id] || 0) + 1
			}
		}
		return counts
	}, [tree])

	// Constrói estrutura flat da árvore para virtualização
	// Agora com suporte a expand/collapse
	const flatTree = useMemo<FlatProductTree | null>(() => {
		if (!tree) return null

		const filter = filterText.toLowerCase().trim()
		const isFiltering = !!filter

		// Lookup de pastas por ID para traversal de ancestrais
		const folderById: Record<string, (typeof tree.folders)[0]> = {}
		tree.folders.forEach((f) => {
			folderById[f.id] = f
		})

		// Ao filtrar: pré-computar quais IDs devem aparecer
		// Regra: nó que bate + todos os seus ancestrais
		const includedIds = new Set<string>()

		if (isFiltering) {
			const addWithAncestors = (startFolderId: string | null) => {
				let id = startFolderId
				while (id) {
					if (includedIds.has(id)) break // ancestral já adicionado, parar
					includedIds.add(id)
					id = folderById[id]?.parent_id ?? null
				}
			}

			tree.products.forEach((product) => {
				const description = product.description || "Sem descrição"
				if (description.toLowerCase().includes(filter)) {
					includedIds.add(product.id)
					addWithAncestors(product.folder_id)
				}
			})

			tree.folders.forEach((folder) => {
				const description = folder.description || `Pasta ${folder.id.substring(0, 8)}...`
				if (description.toLowerCase().includes(filter)) {
					includedIds.add(folder.id)
					addWithAncestors(folder.parent_id)
				}
			})
		}

		const byId: Record<string, ProductTreeNode> = {}
		const byParentId: Record<string, ProductTreeNode[]> = {}

		// 1. Criar todos os nós
		tree.folders.forEach((folder) => {
			if (isFiltering && !includedIds.has(folder.id)) return

			const description = folder.description || `Pasta ${folder.id.substring(0, 8)}...`
			const node: ProductTreeNode = {
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

		tree.products.forEach((product) => {
			if (isFiltering && !includedIds.has(product.id)) return

			const description = product.description || "Sem descrição"
			const node: ProductTreeNode = {
				id: product.id,
				type: "product",
				label: description,
				parentId: product.folder_id,
				level: 1,
				// Produtos são folhas: itens de compra vivem na página de detalhe
				hasChildren: false,
				isExpanded: false,
				data: product,
			}

			byId[product.id] = node

			const parentKey = product.folder_id || "root"
			if (!byParentId[parentKey]) {
				byParentId[parentKey] = []
			}
			byParentId[parentKey].push(node)
		})

		// product_items não são adicionados à árvore —
		// eles vivem em /global/ingredients/$productId

		// 2. Atualizar hasChildren + calcular níveis em O(N) via DFS a partir da raiz.
		// Evita o antigo calculateLevel recursivo que era O(N × profundidade).
		const visibleNodes: ProductTreeNode[] = []

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
	}, [tree, filterText, expandedIds])

	// Estatísticas
	const stats = useMemo(() => {
		if (!tree) return null

		return {
			totalFolders: tree.folders.length,
			totalProducts: tree.products.length,
			totalItems: tree.productItems.length,
		}
	}, [tree])

	return {
		// Dados
		flatTree,
		stats,
		itemCountByProductId,

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
