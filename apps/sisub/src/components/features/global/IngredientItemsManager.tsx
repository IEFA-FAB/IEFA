import { useQueryClient } from "@tanstack/react-query"
import { Boxes, Edit, Link2, PackagePlus, Trash2 } from "lucide-react"
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { type IngredientItemWithPurchase, useDeleteIngredientItem, useIngredientItems } from "@/services/IngredientsService"
import { IngredientItemForm } from "./IngredientItemForm"

interface IngredientItemsManagerProps {
	ingredientId: string
	/** Chamado após qualquer alteração (criar/editar/remover) para registrar uma versão do insumo. */
	onChanged?: () => void
}

interface DialogState {
	isOpen: boolean
	mode: "create" | "edit"
	item?: IngredientItemWithPurchase
}

/** Resumo físico em linha única (embalagem + GTIN), omitindo campos ausentes. */
function stockSummary(item: IngredientItemWithPurchase): string {
	const parts: string[] = []
	if (item.unit_content_quantity != null && item.purchase_measure_unit) parts.push(`${item.unit_content_quantity} ${item.purchase_measure_unit}`)
	else if (item.purchase_measure_unit) parts.push(item.purchase_measure_unit)
	if (item.barcode) parts.push(`GTIN ${item.barcode}`)
	if (item.correction_factor != null && Number(item.correction_factor) !== 1) parts.push(`fc ${item.correction_factor}`)
	return parts.join(" · ")
}

/**
 * Gerenciador de itens de produto (ingredient_item) de um insumo.
 * Item de produto = item de estoque/GS1 (GTIN), vinculado a 1 item de compra (CATMAT).
 */
export function IngredientItemsManager({ ingredientId, onChanged }: IngredientItemsManagerProps) {
	const queryClient = useQueryClient()
	const { ingredientItems } = useIngredientItems(ingredientId)
	const { deleteIngredientItem, isDeleting } = useDeleteIngredientItem()

	const [dialogState, setDialogState] = useState<DialogState>({ isOpen: false, mode: "create" })
	const [deleteTarget, setDeleteTarget] = useState<IngredientItemWithPurchase | null>(null)

	const handleDeleteConfirm = async () => {
		if (!deleteTarget) return
		try {
			await deleteIngredientItem(deleteTarget.id)
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
			onChanged?.()
			toast.success("Item de produto excluído com sucesso!")
		} catch {
			toast.error("Erro ao excluir item")
		} finally {
			setDeleteTarget(null)
		}
	}

	const openCreate = () => setDialogState({ isOpen: true, mode: "create" })
	const openEdit = (item: IngredientItemWithPurchase) => setDialogState({ isOpen: true, mode: "edit", item })
	const closeDialog = () => setDialogState({ isOpen: false, mode: "create" })

	const isEmpty = !ingredientItems || ingredientItems.length === 0

	return (
		<section className="space-y-3">
			{/* Header da seção */}
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Boxes className="size-5 text-muted-foreground" />
						<h2 className="text-heading">Itens de Produto</h2>
						{ingredientItems && <Badge variant="secondary">{ingredientItems.length}</Badge>}
					</div>
					<p className="text-caption text-muted-foreground">Produtos físicos em estoque (GTIN), cada um vinculado a um item de compra.</p>
				</div>
				<Button size="sm" onClick={openCreate} className="gap-2 shrink-0">
					<PackagePlus className="size-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
					<Boxes className="size-10 opacity-30" />
					<p className="text-body">Nenhum item de produto cadastrado</p>
					<Button variant="outline" size="sm" onClick={openCreate}>
						<PackagePlus className="size-4 mr-2" />
						Adicionar primeiro item
					</Button>
				</div>
			) : (
				<ItemGroup>
					{ingredientItems?.map((item) => {
						const summary = stockSummary(item)
						const linked = item.purchase_item
						return (
							<Item key={item.id} variant="outline">
								<ItemMedia variant="icon">
									<Boxes className="text-muted-foreground" />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{item.description}</ItemTitle>
									<ItemDescription className="space-y-0.5">
										<span className="flex items-center gap-1.5">
											<Link2 className="size-3 shrink-0" />
											{linked ? (
												<span>
													Compra: <span className="text-foreground">{linked.description}</span>
													{linked.catmat_item_codigo != null && <span className="ml-1 font-mono">CATMAT {linked.catmat_item_codigo}</span>}
												</span>
											) : (
												<span>Sem item de compra vinculado</span>
											)}
										</span>
										{summary && <span className="block font-mono">{summary}</span>}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => openEdit(item)}
										disabled={isDeleting}
										aria-label={`Editar ${item.description}`}
										className="text-muted-foreground"
									>
										<Edit className="size-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => setDeleteTarget(item)}
										disabled={isDeleting}
										aria-label={`Excluir ${item.description}`}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="size-3.5" />
									</Button>
								</ItemActions>
							</Item>
						)
					})}
				</ItemGroup>
			)}

			{/* Dialog de criação/edição */}
			<IngredientItemForm
				isOpen={dialogState.isOpen}
				onClose={closeDialog}
				mode={dialogState.mode}
				ingredientItem={dialogState.item}
				defaultIngredientId={ingredientId}
				onChanged={onChanged}
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
		</section>
	)
}
