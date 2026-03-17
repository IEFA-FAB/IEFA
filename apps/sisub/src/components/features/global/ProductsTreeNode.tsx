import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Edit, Folder as FolderIcon, Package, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
 */
export function ProductsTreeNode({ node, onEdit, onToggle, itemCount, onNavigate }: ProductsTreeNodeProps) {
	const queryClient = useQueryClient()
	const { deleteFolder, isDeleting: isDeletingFolder } = useDeleteFolder()
	const { deleteProduct, isDeleting: isDeletingProduct } = useDeleteProduct()

	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

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
	const isNavigable = node.type === "product" && !!onNavigate

	const handleDeleteConfirm = async () => {
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
		} finally {
			setIsDeleteDialogOpen(false)
		}
	}

	return (
		<>
			<div
				className={cn(
					"relative flex items-center justify-between px-2 py-2 hover:bg-muted/50 border-b border-border/50",
					isNavigable && "cursor-pointer",
				)}
				style={{ paddingLeft: `${node.level * 24 + 8}px` }}
				role="treeitem"
				tabIndex={0}
				aria-level={node.level + 1}
				aria-expanded={node.hasChildren ? node.isExpanded : undefined}
				onClick={isNavigable ? onNavigate : undefined}
				onKeyDown={
					isNavigable
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onNavigate?.()
								}
							}
						: undefined
				}
			>
				{/* Tree connector lines */}
				{node.level > 0 && (
					<>
						<div className="absolute top-0 bottom-1/2 w-px bg-border/40" style={{ left: `${(node.level - 1) * 24 + 20}px` }} />
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
					{/* Expand/Collapse — apenas para nós com filhos */}
					{node.hasChildren ? (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={(e) => {
								e.stopPropagation()
								onToggle(node.id)
							}}
							aria-label={node.isExpanded ? "Recolher" : "Expandir"}
						>
							{node.isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
						</Button>
					) : (
						<div className="w-5" />
					)}

					{/* Ícone com fundo colorido */}
					<div
						className={cn(
							"flex items-center justify-center w-7 h-7 rounded-[var(--radius)] border",
							style.iconBg,
							style.border,
						)}
					>
						<Icon className={cn("w-3.5 h-3.5", style.iconColor)} />
					</div>

					{/* Label */}
					<span className={cn("text-sm truncate", node.type === "folder" ? "font-semibold" : "font-normal")}>
						{node.label}
					</span>

					{/* Badge de unidade de medida */}
					{node.type === "product" && "measure_unit" in node.data && (
						<Badge variant="outline">{node.data.measure_unit}</Badge>
					)}

					{/* Badge de contagem de itens de compra */}
					{node.type === "product" && itemCount !== undefined && itemCount > 0 && (
						<Badge variant="success">{itemCount} {itemCount === 1 ? "item" : "itens"}</Badge>
					)}
				</div>

				{/* Ações */}
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation()
							onEdit(node.type, node.data as Folder | Product)
						}}
						disabled={isDeleting}
						aria-label={`Editar ${node.label}`}
					>
						<Edit />
					</Button>

					<Button
						variant="destructive"
						size="icon"
						onClick={(e) => {
							e.stopPropagation()
							setIsDeleteDialogOpen(true)
						}}
						disabled={isDeleting}
						aria-label={`Excluir ${node.label}`}
					>
						<Trash2 />
					</Button>
				</div>
			</div>

			<AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir {node.type === "folder" ? "pasta" : "produto"}</AlertDialogTitle>
						<AlertDialogDescription>
							Tem certeza que deseja excluir <strong>{node.label}</strong>? Esta ação não pode ser desfeita.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
							{isDeleting ? "Excluindo..." : "Excluir"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
