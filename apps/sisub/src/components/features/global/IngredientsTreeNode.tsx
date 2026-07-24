import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarCheck, ChevronDown, ChevronRight, Edit, Folder as FolderIcon, Loader2, Package, RotateCcw, Trash2 } from "lucide-react"
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { ingredientNutrientsQueryOptions, useDeleteFolder, useDeleteIngredient, useRestoreFolder, useRestoreIngredient } from "@/services/IngredientsService"
import type { Folder, Ingredient, IngredientTreeNode, TreeNodeType } from "@/types/domain/ingredients"

interface IngredientsTreeNodeProps {
	node: IngredientTreeNode
	onEdit: (type: TreeNodeType, data: Folder | Ingredient) => void
	onToggle: (nodeId: string) => void
	/** Quantidade de itens de compra vinculados (apenas para nós do tipo "ingredient") */
	itemCount?: number
	/** Data ISO da última revisão (conferência) do insumo — undefined p/ pastas, null p/ insumo nunca revisado */
	lastReviewedAt?: string | null
	/** Callback de navegação para a página de detalhe do ingrediente */
	onNavigate?: () => void
	/** Modo de seleção em massa ativo: exibe checkbox e desativa ações por linha */
	selectionMode?: boolean
	/** Se este nó está selecionado (modo de seleção em massa) */
	selected?: boolean
	/** Alterna a seleção deste nó */
	onSelectChange?: (checked: boolean) => void
}

/** Separa "Carboidratos (g)" → { label: "Carboidratos", unit: "g" } */
function parseNutrientName(name: string): { label: string; unit: string | null } {
	const match = name.match(/\s*\(([^)]+)\)\s*$/)
	if (match && match.index != null) return { label: name.slice(0, match.index).trim(), unit: match[1] }
	return { label: name, unit: null }
}

function formatNutrientValue(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/** Conteúdo do hovercard de um insumo: prévia da tabela nutricional (montado só ao abrir → fetch sob demanda) */
function IngredientHoverContent({ ingredient }: { ingredient: Ingredient }) {
	const { data, isLoading } = useQuery(ingredientNutrientsQueryOptions(ingredient.id))

	// Ordena como rótulo nutricional BR: valor energético primeiro, depois display_order.
	// Só nutrientes com valor preenchido — o resto não agrega ao preview.
	const rows = (data ?? [])
		.filter((n) => n.nutrient_value != null && n.nutrient && !n.nutrient.deleted_at)
		.sort((a, b) => {
			if (a.nutrient.is_energy_value !== b.nutrient.is_energy_value) return a.nutrient.is_energy_value ? -1 : 1
			return (a.nutrient.display_order ?? 999) - (b.nutrient.display_order ?? 999)
		})

	const preview = rows.slice(0, 7)
	const extra = rows.length - preview.length

	return (
		<>
			<div className="flex items-start gap-2">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] border border-primary/20 bg-primary/10">
					<Package className="size-3.5 text-primary" />
				</div>
				<div className="min-w-0">
					<p className="text-sm font-semibold leading-tight">{ingredient.description || "Sem descrição"}</p>
					<p className="text-xs text-muted-foreground">Informação nutricional</p>
				</div>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					Carregando nutrientes…
				</div>
			) : preview.length === 0 ? (
				<p className="py-1 text-xs text-muted-foreground">Sem dados nutricionais cadastrados.</p>
			) : (
				<div className="flex flex-col gap-1 text-xs">
					{preview.map((n) => {
						const { label, unit } = parseNutrientName(n.nutrient.name)
						return (
							<div key={n.id} className={cn("flex items-baseline justify-between gap-3", n.nutrient.is_energy_value && "font-semibold")}>
								<span className={cn("truncate", n.nutrient.is_energy_value ? "text-foreground" : "text-muted-foreground")}>{label}</span>
								<span className="shrink-0 font-mono tabular-nums">
									{formatNutrientValue(n.nutrient_value as number)}
									{unit ? ` ${unit}` : ""}
								</span>
							</div>
						)
					})}
					{extra > 0 && <p className="pt-0.5 text-[11px] text-muted-foreground">+{extra} outros nutrientes</p>}
				</div>
			)}
		</>
	)
}

/**
 * Nó individual da árvore de produtos
 * Renderização otimizada para virtualização
 */
/** Formata a data ISO da revisão como "09/06/2026" (curto, pt-BR). */
function formatReviewDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function IngredientsTreeNode({
	node,
	onEdit,
	onToggle,
	itemCount,
	lastReviewedAt,
	onNavigate,
	selectionMode,
	selected,
	onSelectChange,
}: IngredientsTreeNodeProps) {
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

	// Cor por nível via tokens semânticos (STYLE_CONTRACT §4.1 — zero cores hardcoded):
	// nível 1 → governance (roxo) · nível 2 → success (verde) · nível 3+ → warning (amarelo)
	const FOLDER_LEVEL_STYLES = [
		{ iconBg: "bg-governance/10 dark:bg-governance/20", iconColor: "text-governance", border: "border-governance/20" },
		{ iconBg: "bg-success/10 dark:bg-success/20", iconColor: "text-success", border: "border-success/20" },
		{ iconBg: "bg-warning/10 dark:bg-warning/20", iconColor: "text-warning", border: "border-warning/20" },
	]

	const INGREDIENT_STYLE = { iconBg: "bg-primary/10 dark:bg-primary/20", iconColor: "text-primary", border: "border-primary/20" }

	const style = node.type === "folder" ? (FOLDER_LEVEL_STYLES[Math.min(node.level, 2)] ?? FOLDER_LEVEL_STYLES[2]) : INGREDIENT_STYLE
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

					{/* Label — insumos exibem hovercard com dados básicos ao passar o mouse */}
					{node.type === "ingredient" ? (
						<HoverCard>
							<HoverCardTrigger
								render={
									<span className={cn("text-sm truncate font-normal cursor-default", isDeleted && "line-through text-muted-foreground")}>{node.label}</span>
								}
							/>
							<HoverCardContent side="right" align="start">
								<IngredientHoverContent ingredient={node.data as Ingredient} />
							</HoverCardContent>
						</HoverCard>
					) : (
						<span
							className={cn(
								"text-sm truncate leading-normal",
								// Hierarquia tipo documento de texto por nível (0-indexed → nível doc = level + 1)
								node.level === 0 && "font-bold uppercase tracking-wide",
								node.level === 1 && "font-medium uppercase",
								node.level >= 2 && "font-bold",
								isDeleted && "line-through text-muted-foreground"
							)}
						>
							{node.label}
						</span>
					)}

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

					{/* Status de revisão (conferência pelos nutricionistas) */}
					{node.type === "ingredient" &&
						!isDeleted &&
						lastReviewedAt !== undefined &&
						(lastReviewedAt ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<Badge variant="outline" className="gap-1 text-muted-foreground">
											<CalendarCheck className="size-3" />
											Revisado {formatReviewDate(lastReviewedAt)}
										</Badge>
									}
								/>
								<TooltipContent>Última revisão em {formatReviewDate(lastReviewedAt)}</TooltipContent>
							</Tooltip>
						) : (
							<Tooltip>
								<TooltipTrigger render={<Badge variant="warning">Não revisado</Badge>} />
								<TooltipContent>Insumo ainda não revisado</TooltipContent>
							</Tooltip>
						))}
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
