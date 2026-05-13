import type { IngredientItem } from "@iefa/database/sisub"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Edit, PackagePlus, ShoppingCart, Trash2 } from "lucide-react"
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
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useDeleteIngredientItem, useIngredientItems } from "@/services/IngredientsService"
import { IngredientItemForm } from "./IngredientItemForm"

interface IngredientItemsManagerProps {
	ingredientId: string
}

interface DialogState {
	isOpen: boolean
	mode: "create" | "edit"
	item?: IngredientItem
}

/**
 * Gerenciador de itens de compra de um ingrediente específico.
 * Responsabilidade única: listar, criar, editar e excluir itens de compra.
 */
export function IngredientItemsManager({ ingredientId }: IngredientItemsManagerProps) {
	const queryClient = useQueryClient()
	const { ingredientItems } = useIngredientItems(ingredientId)
	const { deleteIngredientItem, isDeleting } = useDeleteIngredientItem()

	const [dialogState, setDialogState] = useState<DialogState>({
		isOpen: false,
		mode: "create",
	})
	const [deleteTarget, setDeleteTarget] = useState<IngredientItem | null>(null)
	const [openItems, setOpenItems] = useState<Set<string>>(new Set())

	const toggleItem = (id: string) => {
		setOpenItems((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const handleDeleteConfirm = async () => {
		if (!deleteTarget) return
		try {
			await deleteIngredientItem(deleteTarget.id)
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
			toast.success("Item excluído com sucesso!")
		} catch {
			toast.error("Erro ao excluir item")
		} finally {
			setDeleteTarget(null)
		}
	}

	const openCreate = () => setDialogState({ isOpen: true, mode: "create" })
	const openEdit = (item: IngredientItem) => setDialogState({ isOpen: true, mode: "edit", item })
	const closeDialog = () => setDialogState({ isOpen: false, mode: "create" })

	const isEmpty = !ingredientItems || ingredientItems.length === 0

	return (
		<div className="space-y-4">
			{/* Header da seção */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ShoppingCart className="w-5 h-5 text-success" />
					<h2 className="text-lg font-semibold">Itens de Compra</h2>
					{ingredientItems && <Badge variant="success">{ingredientItems.length}</Badge>}
				</div>
				<Button size="sm" onClick={openCreate} className="gap-2">
					<PackagePlus className="w-4 h-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			<Card>
				{isEmpty ? (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
						<ShoppingCart className="w-10 h-10 opacity-30" />
						<p className="font-sans">Nenhum item de compra cadastrado</p>
						<Button variant="outline" size="sm" onClick={openCreate}>
							<PackagePlus className="w-4 h-4 mr-2" />
							Adicionar primeiro item
						</Button>
					</div>
				) : (
					<div className="divide-y divide-border/50">
						{ingredientItems?.map((item) => (
							<Collapsible key={item.id} open={openItems.has(item.id)} onOpenChange={() => toggleItem(item.id)}>
								<div className="group flex items-center px-4 py-3 hover:bg-muted/50 transition-colors gap-2">
									<CollapsibleTrigger className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-none p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-[var(--radius)]">
										<div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] bg-success/10 border border-success/20 shrink-0">
											<ShoppingCart className="w-4 h-4 text-success" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												<p className="text-sm font-medium truncate">{item.description}</p>
												<ChevronDown
													className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", openItems.has(item.id) && "rotate-180")}
												/>
											</div>
											<div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
												{item.barcode && (
													<Badge variant="outline">
														<span className="font-mono">#{item.barcode}</span>
													</Badge>
												)}
												{item.purchase_measure_unit && (
													<Badge variant="outline">
														<span className="font-mono">
															{item.unit_content_quantity} {item.purchase_measure_unit}
														</span>
													</Badge>
												)}
												{item.correction_factor && Number(item.correction_factor) !== 1 && (
													<Badge variant="outline">
														<span className="font-mono">fc {item.correction_factor}</span>
													</Badge>
												)}
											</div>
										</div>
									</CollapsibleTrigger>

									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 shrink-0">
										<Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} disabled={isDeleting} aria-label={`Editar ${item.description}`}>
											<Edit className="w-3.5 h-3.5" />
										</Button>
										<Button
											variant="destructive"
											size="icon-sm"
											onClick={() => setDeleteTarget(item)}
											disabled={isDeleting}
											aria-label={`Excluir ${item.description}`}
										>
											<Trash2 className="w-3.5 h-3.5" />
										</Button>
									</div>
								</div>

								<CollapsibleContent>
									<div className="px-4 pb-4 ml-11 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
										{item.barcode && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Código de barras</span>
												<span className="font-mono">{item.barcode}</span>
											</div>
										)}
										{item.purchase_measure_unit && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Unidade de compra</span>
												<span className="font-mono">{item.purchase_measure_unit}</span>
											</div>
										)}
										{item.unit_content_quantity != null && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Qtd por unidade</span>
												<span className="font-mono">{item.unit_content_quantity}</span>
											</div>
										)}
										{item.correction_factor != null && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Fator de correção</span>
												<span className="font-mono">{item.correction_factor}</span>
											</div>
										)}
										<div className="flex flex-col gap-0.5 col-span-2">
											<span className="text-xs text-muted-foreground">ID</span>
											<span className="font-mono text-xs text-muted-foreground">{item.id}</span>
										</div>
									</div>
								</CollapsibleContent>
							</Collapsible>
						))}
					</div>
				)}
			</Card>

			{/* Dialog de criação/edição */}
			<IngredientItemForm
				isOpen={dialogState.isOpen}
				onClose={closeDialog}
				mode={dialogState.mode}
				ingredientItem={dialogState.item}
				defaultIngredientId={ingredientId}
			/>

			{/* AlertDialog de confirmação de exclusão */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir item</AlertDialogTitle>
						<AlertDialogDescription>
							Tem certeza que deseja excluir <strong>{deleteTarget?.description}</strong>? Esta ação não pode ser desfeita.
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
		</div>
	)
}
