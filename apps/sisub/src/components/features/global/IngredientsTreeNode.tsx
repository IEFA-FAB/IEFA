import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Edit, Folder as FolderIcon, Package, RotateCcw, Trash2 } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/cn"
import { useDeleteFolder, useDeleteIngredient, useRestoreFolder, useRestoreIngredient } from "@/services/IngredientsService"
import type { Folder, Ingredient, IngredientTreeNode, TreeNodeType } from "@/types/domain/ingredients"

interface IngredientsTreeNodeProps {
	node: IngredientTreeNode
	onEdit: (type: TreeNodeType, data: Folder | Ingredient) => void
	onToggle: (nodeId: string) => void
	/** Quantidade de itens de compra vinculados (apenas para nós do tipo "ingredient") */
	itemCount?: number
	/** Callback de navegação para a página de detalhe do ingrediente */
	onNavigate?: () => void
	/** Modo de seleção em massa ativo: exibe checkbox e desativa ações por linha */
	selectionMode?: boolean
	/** Se este nó está selecionado (modo de seleção em massa) */
	selected?: boolean
	/** Alterna a seleção deste nó */
	onSelectChange?: (checked: boolean) => void
}

/**
 * Nó individual da árvore de produtos
 * Renderização otimizada para virtualização
 */
export function IngredientsTreeNode({ node, onEdit, onToggle, itemCount, onNavigate, selectionMode, selected, onSelectChange }: IngredientsTreeNodeProps) {
	const queryClient = useQueryClient()
	const { deleteFolder, isDeleting: isDeletingFolder } = useDeleteFolder()
	const { deleteIngredient, isDeleting: isDeletingIngredient } = useDeleteIngredient()
	const { restoreFolder, isRestoring: isRestoringFolder } = useRestoreFolder()
	const { restoreIngredient, isRestoring: isRestoringIngredient } = useRestoreIngredient()

	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

	const isDeleting = isDeletingFolder || isDeletingIngredient
	const isRestoring = isRestoringFolder || isRestoringIngredient
	const isBusy = isDeleting || isRestoring
	const isDeleted = !!(node.data as Folder | Ingredient).deleted_at

	const Icon = node.type === "folder" ? FolderIcon : Package

	const typeStyles = {
		folder: {
			iconBg: "bg-warning/10 dark:bg-warning/20",
			iconColor: "text-warning",
			border: "border-warning/20",
		},
		ingredient: {
			iconBg: "bg-primary/10 dark:bg-primary/20",
			iconColor: "text-primary",
			border: "border-primary/20",
		},
	}

	const style = typeStyles[node.type as "folder" | "ingredient"]
	const isNavigable = node.type === "ingredient" && !!onNavigate

	const handleDeleteConfirm = async () => {
		try {
			if (node.type === "folder") {
				await deleteFolder(node.id)
				toast.success("Pasta excluída com sucesso!")
			} else {
				await deleteIngredient(node.id)
				toast.success("Insumo excluído com sucesso!")
			}

			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
		} catch (_error) {
			toast.error("Erro ao excluir item")
		} finally {
			setIsDeleteDialogOpen(false)
		}
	}

	const handleRestore = async () => {
		try {
			if (node.type === "folder") {
				await restoreFolder(node.id)
				toast.success("Pasta restaurada com sucesso!")
			} else {
				await restoreIngredient(node.id)
				toast.success("Insumo restaurado com sucesso!")
			}
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
		} catch (_error) {
			toast.error("Erro ao restaurar item")
		}
	}

	return (
		<>
			<div
				className={cn(
					"relative flex items-center justify-between px-2 py-2 hover:bg-muted/50 border-b border-border/50",
					(isNavigable || selectionMode) && "cursor-pointer",
					selected && "bg-primary/5"
				)}
				style={{ paddingLeft: `${node.level * 24 + 8}px` }}
				role="treeitem"
				tabIndex={0}
				aria-level={node.level + 1}
				aria-expanded={node.hasChildren ? node.isExpanded : undefined}
				aria-selected={selectionMode ? !!selected : undefined}
				onClick={selectionMode ? () => onSelectChange?.(!selected) : isNavigable ? onNavigate : undefined}
				onKeyDown={
					selectionMode
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onSelectChange?.(!selected)
								}
							}
						: isNavigable
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
					{/* Checkbox de seleção em massa */}
					{selectionMode && (
						<Checkbox
							checked={!!selected}
							onCheckedChange={(checked) => onSelectChange?.(checked === true)}
							onClick={(e) => e.stopPropagation()}
							aria-label={`Selecionar ${node.label}`}
						/>
					)}

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
							{node.isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
						</Button>
					) : (
						<div className="w-5" />
					)}

					{/* Ícone com fundo colorido */}
					<div className={cn("flex items-center justify-center size-7 rounded-[var(--radius)] border", style.iconBg, style.border)}>
						<Icon className={cn("size-3.5", style.iconColor)} />
					</div>

					{/* Label */}
					<span
						className={cn("text-sm truncate", node.type === "folder" ? "text-subheading" : "font-normal", isDeleted && "line-through text-muted-foreground")}
					>
						{node.label}
					</span>

					{/* Badge de item excluído */}
					{isDeleted && <Badge variant="destructive">Excluído</Badge>}

					{/* Badge de unidade de medida */}
					{node.type === "ingredient" && "measure_unit" in node.data && <Badge variant="outline">{node.data.measure_unit}</Badge>}

					{/* Badge de contagem de itens de compra */}
					{node.type === "ingredient" && itemCount !== undefined && itemCount > 0 && (
						<Badge variant="success">
							{itemCount} {itemCount === 1 ? "item" : "itens"}
						</Badge>
					)}
				</div>

				{/* Ações — ocultas no modo de seleção em massa */}
				<div className={cn("flex items-center gap-1", selectionMode && "hidden")}>
					{isDeleted ? (
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={(e) => {
								e.stopPropagation()
								handleRestore()
							}}
							disabled={isBusy}
							aria-label={`Restaurar ${node.label}`}
						>
							<RotateCcw className="size-4" />
							Restaurar
						</Button>
					) : (
						<>
							<Button
								variant="ghost"
								size="icon"
								onClick={(e) => {
									e.stopPropagation()
									if (node.type === "ingredient" && onNavigate) {
										onNavigate()
									} else {
										onEdit(node.type, node.data as Folder | Ingredient)
									}
								}}
								disabled={isBusy}
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
								disabled={isBusy}
								aria-label={`Excluir ${node.label}`}
							>
								<Trash2 />
							</Button>
						</>
					)}
				</div>
			</div>

			<AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir {node.type === "folder" ? "pasta" : "insumo"}</AlertDialogTitle>
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
