import { useMemo } from "react";
import { useProductsTree } from "@/services/ProductsService";
import type { FlatProductTree, ProductTreeNode } from "@/types/domain/products";

/**
 * Hook avançado que orquestra os dados de produtos
 * Gerencia estado de filtro, árvore hierárquica e virtualização
 *
 * Segue padrão: hooks/ orquestram múltiplos services e gerenciam estado de UI
 */
export function useProductsHierarchy(filterText = "") {
	// Busca dados via service
	const { tree, error, refetch } = useProductsTree();

	// Constrói estrutura flat da árvore para virtualização
	const flatTree = useMemo<FlatProductTree | null>(() => {
		if (!tree) return null;

		const nodes: ProductTreeNode[] = [];
		const byId: Record<string, ProductTreeNode> = {};
		const byParentId: Record<string, ProductTreeNode[]> = {};

		const filter = filterText.toLowerCase().trim();

		// 1. Adicionar folders
		tree.folders.forEach((folder) => {
			const description =
				folder.description || `Pasta ${folder.id.substring(0, 8)}...`;
			const shouldInclude =
				!filter || description.toLowerCase().includes(filter);

			if (shouldInclude || !filter) {
				const node: ProductTreeNode = {
					id: folder.id,
					type: "folder",
					label: description,
					parentId: folder.parent_id,
					level: 0,
					hasChildren: true,
					isExpanded: false,
					data: folder,
				};

				nodes.push(node);
				byId[folder.id] = node;

				const parentKey = folder.parent_id || "root";
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = [];
				}
				byParentId[parentKey].push(node);
			}
		});

		// 2. Adicionar products
		tree.products.forEach((product) => {
			const description = product.description || "Sem descrição";
			const shouldInclude =
				!filter || description.toLowerCase().includes(filter);

			if (shouldInclude || !filter) {
				const node: ProductTreeNode = {
					id: product.id,
					type: "product",
					label: description,
					parentId: product.folder_id,
					level: 1,
					hasChildren: true,
					isExpanded: false,
					data: product,
				};

				nodes.push(node);
				byId[product.id] = node;

				const parentKey = product.folder_id || "root";
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = [];
				}
				byParentId[parentKey].push(node);
			}
		});

		// 3. Adicionar product items
		tree.productItems.forEach((item) => {
			const description = item.description || "Sem descrição";
			const shouldInclude =
				!filter || description.toLowerCase().includes(filter);

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
				};

				nodes.push(node);
				byId[item.id] = node;

				const parentKey = item.product_id || "root";
				if (!byParentId[parentKey]) {
					byParentId[parentKey] = [];
				}
				byParentId[parentKey].push(node);
			}
		});

		// 4. Calcular níveis hierárquicos
		const calculateLevel = (nodeId: string, level = 0): number => {
			const node = byId[nodeId];
			if (!node || !node.parentId) return level;
			return calculateLevel(node.parentId, level + 1);
		};

		nodes.forEach((node) => {
			node.level = calculateLevel(node.id);
		});

		return { nodes, byId, byParentId };
	}, [tree, filterText]);

	// Estatísticas
	const stats = useMemo(() => {
		if (!tree) return null;

		return {
			totalFolders: tree.folders.length,
			totalProducts: tree.products.length,
			totalItems: tree.productItems.length,
		};
	}, [tree]);

	return {
		// Dados
		flatTree,
		stats,

		// Estados (componente decide skeleton)
		error,

		// Ações
		refetch,
	};
}
