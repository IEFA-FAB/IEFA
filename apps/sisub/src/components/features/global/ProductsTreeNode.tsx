import { useQueryClient } from "@tanstack/react-query"
import {
	ChevronDown,
	ChevronRight,
	Edit,
	ExternalLink,
	Folder as FolderIcon,
	Package,
	Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { useDeleteFolder, useDeleteProduct } from "@/services/ProductsService"
import type { Folder, Product, ProductTreeNode, TreeNodeType } from "@/types/domain/products"

interface ProductsTreeNodeProps {
	node: ProductTreeNode
	onEdit: (type: TreeNodeType, data: Folder | Product) => void
	onToggle: (nodeId: string) => void
	/** Quantidade de itens de compra vinculados (apenas para nós do tipo "product") */
	itemCount?: number
	/** Callback de navegação para a página de detalhe do produto */
	onNavigate?: () => void
}

/**
 * Nó individual da árvore de produtos
 * Renderização otimizada para virtualização
 * Enhanced with Industrial-Technical aesthetic
 */
export function ProductsTreeNode({
	node,
	onEdit,
	onToggle,
	itemCount,
	onNavigate,
}: ProductsTreeNodeProps) {
	const queryClient = useQueryClient()
	const { deleteFolder, isDeleting: isDeletingFolder } = useDeleteFolder()
	const { deleteProduct, isDeleting: isDeletingProduct } = useDeleteProduct()

	const isDeleting = isDeletingFolder || isDeletingProduct

	const Icon = node.type === "folder" ? FolderIcon : Package

	const typeStyles = {
		folder: {
			iconBg: "bg-warning/10 dark:bg-warning/20",
			iconColor: "text-warning",
			border: "border-warning/20",
		},
		product: {
			iconBg: "bg-primary/10 dark:bg-primary/20",
			iconColor: "text-primary",
			border: "border-primary/20",
		},
	}

	const style = typeStyles[node.type as "folder" | "product"]

	const handleDelete = async () => {
		if (!confirm(`Tem certeza que deseja excluir "${node.label}"?`)) return

		try {
			if (node.type === "folder") {
				await deleteFolder(node.id)
				toast.success("Pasta excluída com sucesso!")
			} else {
				await deleteProduct(node.id)
				toast.success("Produto excluído com sucesso!")
			}

			await queryClient.invalidateQueries({ queryKey: ["products"] })
		} catch (error) {
			toast.error("Erro ao excluir item")
			console.error(error)
		}
	}

	return (
		<div
			className="group relative flex items-center justify-between px-2 py-2 hover:bg-muted/50 border-b border-border/50 transition-all duration-150 hover:border-l-2 hover:border-l-primary/50"
			style={{ paddingLeft: `${node.level * 24 + 8}px` }}
			role="treeitem"
			tabIndex={0}
			aria-level={node.level + 1}
			aria-expanded={node.hasChildren ? node.isExpanded : undefined}
		>
			{/* Tree connector lines */}
			{node.level > 0 && (
				<>
					<div
						className="absolute top-0 bottom-1/2 w-px bg-border/40"
						style={{ left: `${(node.level - 1) * 24 + 20}px` }}
					/>
					<div
						className="absolute top-1/2 h-px bg-border/40"
						style={{
							left: `${(node.level - 1) * 24 + 20}px`,
							width: "16px",
						}}
					/>
				</>
			)}

			{/* Conteúdo */}
			<div className="flex items-center gap-2 flex-1 min-w-0">
				{/* Expand/Collapse — apenas para pastas */}
				{node.hasChildren ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onToggle(node.id)}
						className="h-5 w-5 p-0 hover:bg-primary/10 transition-colors"
						aria-label={node.isExpanded ? "Recolher" : "Expandir"}
					>
						{node.isExpanded ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						)}
					</Button>
				) : (
					<div className="w-5" />
				)}

				{/* Ícone com fundo colorido */}
				<div
					className={cn(
						"flex items-center justify-center w-7 h-7 rounded-md border transition-transform duration-200 group-hover:scale-110",
						style.iconBg,
						style.border
					)}
				>
					<Icon className={cn("w-3.5 h-3.5", style.iconColor)} />
				</div>

				{/* Label */}
				<span
					className={cn(
						"text-sm truncate transition-colors",
						node.type === "folder" ? "font-sans font-semibold" : "font-sans font-normal"
					)}
				>
					{node.label}
				</span>

				{/* Badge de unidade de medida */}
				{node.type === "product" && "measure_unit" in node.data && (
					<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono tracking-wide bg-muted/50 text-muted-foreground border border-border/30">
						{node.data.measure_unit}
					</span>
				)}

				{/* Badge de contagem de itens de compra */}
				{node.type === "product" && itemCount !== undefined && itemCount > 0 && (
					<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono tracking-wide bg-success/10 text-success border border-success/20">
						{itemCount} {itemCount === 1 ? "item" : "itens"}
					</span>
				)}
			</div>

			{/* Ações — reveladas no hover */}
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
				{/* Navegar para itens de compra (apenas produtos) */}
				{node.type === "product" && onNavigate && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="sm"
									onClick={onNavigate}
									disabled={isDeleting}
									aria-label={`Ver itens de compra de ${node.label}`}
									className="h-8 w-8 p-0 transition-all duration-150 hover:bg-primary/10 hover:text-primary"
								>
									<ExternalLink className="w-3.5 h-3.5" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Ver itens de compra</TooltipContent>
					</Tooltip>
				)}

				<Button
					variant="ghost"
					size="sm"
					onClick={() => onEdit(node.type, node.data as Folder | Product)}
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
	)
}
