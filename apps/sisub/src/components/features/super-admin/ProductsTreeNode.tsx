import { Button } from "@iefa/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Edit, Folder, Package, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
	useDeleteFolder,
	useDeleteProduct,
	useDeleteProductItem,
} from "@/services/ProductsService";
import type { ProductTreeNode, TreeNodeType } from "@/types/domain/products";

interface ProductsTreeNodeProps {
	node: ProductTreeNode;
	onEdit: (type: TreeNodeType, data: any) => void;
}

/**
 * Nó individual da árvore de produtos
 * Renderização otimizada para virtualização
 */
export function ProductsTreeNode({ node, onEdit }: ProductsTreeNodeProps) {
	const queryClient = useQueryClient();
	const { deleteFolder, isDeleting: isDeletingFolder } = useDeleteFolder();
	const { deleteProduct, isDeleting: isDeletingProduct } = useDeleteProduct();
	const { deleteProductItem, isDeleting: isDeletingItem } =
		useDeleteProductItem();

	const isDeleting = isDeletingFolder || isDeletingProduct || isDeletingItem;

	// Ícone por tipo
	const Icon =
		node.type === "folder"
			? Folder
			: node.type === "product"
				? Package
				: ShoppingCart;

	// Cor por tipo
	const colorClass =
		node.type === "folder"
			? "text-yellow-600 dark:text-yellow-500"
			: node.type === "product"
				? "text-blue-600 dark:text-blue-500"
				: "text-green-600 dark:text-green-500";

	// Handler de delete
	const handleDelete = async () => {
		const confirmMessage = `Tem certeza que deseja excluir "${node.label}"?`;
		if (!confirm(confirmMessage)) return;

		try {
			if (node.type === "folder") {
				await deleteFolder(node.id);
				toast.success("Pasta excluída com sucesso!");
			} else if (node.type === "product") {
				await deleteProduct(node.id);
				toast.success("Produto excluído com sucesso!");
			} else {
				await deleteProductItem(node.id);
				toast.success("Item excluído com sucesso!");
			}

			await queryClient.invalidateQueries({
				queryKey: ["products"],
			});
		} catch (error) {
			toast.error("Erro ao excluir item");
			console.error(error);
		}
	};

	return (
		<div
			className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 group border-b border-border/50"
			style={{
				paddingLeft: `${node.level * 24 + 16}px`,
			}}
			role="treeitem"
			aria-level={node.level + 1}
		>
			{/* Conteúdo */}
			<div className="flex items-center gap-3 flex-1 min-w-0">
				<Icon className={`w-4 h-4 flex-shrink-0 ${colorClass}`} />
				<span className="text-sm truncate">{node.label}</span>

				{/* Badges informativos */}
				{node.type === "product" && "measure_unit" in node.data && (
					<span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
						{node.data.measure_unit}
					</span>
				)}
				{node.type === "product_item" &&
					"barcode" in node.data &&
					node.data.barcode && (
						<span className="text-xs text-muted-foreground font-mono">
							{node.data.barcode}
						</span>
					)}
			</div>

			{/* Ações */}
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onEdit(node.type, node.data)}
					disabled={isDeleting}
					aria-label={`Editar ${node.label}`}
				>
					<Edit className="w-3.5 h-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={handleDelete}
					disabled={isDeleting}
					aria-label={`Excluir ${node.label}`}
					className="text-destructive hover:text-destructive"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	);
}
