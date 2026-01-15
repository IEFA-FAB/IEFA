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
 * Enhanced with Industrial-Technical aesthetic
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

	// Configuração de estilo por tipo (Industrial-Technical)
	const typeStyles = {
		folder: {
			iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
			iconColor: "text-amber-600 dark:text-amber-500",
			border: "border-amber-500/20",
		},
		product: {
			iconBg: "bg-blue-500/10 dark:bg-blue-500/20",
			iconColor: "text-blue-600 dark:text-blue-500",
			border: "border-blue-500/20",
		},
		product_item: {
			iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
			iconColor: "text-emerald-600 dark:text-emerald-500",
			border: "border-emerald-500/20",
		},
	};

	const style = typeStyles[node.type];

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
			className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 group border-b border-border/50 transition-all duration-150 hover:border-l-2 hover:border-l-primary/50"
			style={{
				paddingLeft: `${node.level * 20 + 16}px`,
			}}
			role="treeitem"
			aria-level={node.level + 1}
		>
			{/* Conteúdo */}
			<div className="flex items-center gap-3 flex-1 min-w-0">
				{/* Icon with colored background */}
				<div
					className={`flex items-center justify-center w-8 h-8 rounded-md ${style.iconBg} ${style.border} border transition-transform duration-200 group-hover:scale-110`}
				>
					<Icon className={`w-4 h-4 ${style.iconColor}`} />
				</div>

				<span className="text-sm font-sans truncate">{node.label}</span>

				{/* Badges informativos */}
				{node.type === "product" && "measure_unit" in node.data && (
					<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono tracking-wide bg-muted/50 text-muted-foreground border border-border/30">
						{node.data.measure_unit}
					</span>
				)}
				{node.type === "product_item" &&
					"barcode" in node.data &&
					node.data.barcode && (
						<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono tracking-wide bg-muted/50 text-muted-foreground border border-border/30">
							#{node.data.barcode}
						</span>
					)}
			</div>

			{/* Ações - Staggered reveal on hover */}
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onEdit(node.type, node.data)}
					disabled={isDeleting}
					aria-label={`Editar ${node.label}`}
					className="h-8 w-8 p-0 transition-all duration-150 hover:bg-primary/10 hover:text-primary"
					style={{ transitionDelay: "0.05s" }}
				>
					<Edit className="w-3.5 h-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={handleDelete}
					disabled={isDeleting}
					aria-label={`Excluir ${node.label}`}
					className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
					style={{ transitionDelay: "0.1s" }}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	);
}
