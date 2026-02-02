import { useMemo, useState } from "react"
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
	// Inicializa com todas as pastas de primeiro nível expandidas
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
		if (!tree) return new Set()
		// Expandir todas as folders sem parent (nível raiz)
		const rootFolders = tree.folders.filter((f) => !f.parent_id).map((f) => f.id)
		return new Set(rootFolders)
	})

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
		const allFolderIds = new Set(tree.folders.map((f) => f.id))
		const allProductIds = new Set(tree.products.map((p) => p.id))
		setExpandedIds(new Set([...allFolderIds, ...allProductIds]))
	}

	const collapseAll = () => {
		setExpandedIds(new Set())
	}

	// Constrói estrutura flat da árvore para virtualização
	// Agora com suporte a expand/collapse
	const flatTree = useMemo<FlatProductTree | null>(() => {
		if (!tree) return null

		const byId: Record<string, ProductTreeNode> = {}
		const byParentId: Record<string, ProductTreeNode[]> = {}

		const filter = filterText.toLowerCase().trim()

		// 1. Criar todos os nós
		tree.folders.forEach((folder) => {
			const description = folder.description || `Pasta ${folder.id.substring(0, 8)}...`
			const shouldInclude = !filter || description.toLowerCase().includes(filter)

			if (shouldInclude || !filter) {
				const node: ProductTreeNode = {
					id: folder.id,
					type: "folder",
					label: description,
					parentId: folder.parent_id,
					level: 0,
					hasChildren: true,
					isExpanded: expandedIds.has(folder.id),
					data: folder,
				}

				byId[folder.id] = node

				const parentKey = folder.parent_id || "root"
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = []
				}
				byParentId[parentKey].push(node)
			}
		})

		tree.products.forEach((product) => {
			const description = product.description || "Sem descrição"
			const shouldInclude = !filter || description.toLowerCase().includes(filter)

			if (shouldInclude || !filter) {
				const node: ProductTreeNode = {
					id: product.id,
					type: "product",
					label: description,
					parentId: product.folder_id,
					level: 1,
					hasChildren: true,
					isExpanded: expandedIds.has(product.id),
					data: product,
				}

				byId[product.id] = node

				const parentKey = product.folder_id || "root"
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = []
				}
				byParentId[parentKey].push(node)
			}
		})

		tree.productItems.forEach((item) => {
			const description = item.description || "Sem descrição"
			const shouldInclude = !filter || description.toLowerCase().includes(filter)

			if (shouldInclude || !filter) {
				const node: ProductTreeNode = {
					id: item.id,
					type: "product_item",
					label: description,
					parentId: item.product_id,
					level: 2,
					hasChildren: false,
					isExpanded: false,
					data: item,
				}

				byId[item.id] = node

				const parentKey = item.product_id || "root"
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = []
				}
				byParentId[parentKey].push(node)
			}
		})

		// 2. Calcular níveis hierárquicos
		const calculateLevel = (nodeId: string, level = 0): number => {
			const node = byId[nodeId]
			if (!node || !node.parentId) return level
			return calculateLevel(node.parentId, level + 1)
		}

		Object.values(byId).forEach((node) => {
			node.level = calculateLevel(node.id)
		})

		// 3. Construir lista de nós visíveis (respeitando expand/collapse)
		const visibleNodes: ProductTreeNode[] = []

		const traverse = (parentId: string | null) => {
			const children = byParentId[parentId || "root"] || []

			children.forEach((node) => {
				visibleNodes.push(node)

				// Só mostrar filhos se o nó estiver expandido
				if (node.isExpanded && expandedIds.has(node.id)) {
					traverse(node.id)
				}
			})
		}

		traverse(null)

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
