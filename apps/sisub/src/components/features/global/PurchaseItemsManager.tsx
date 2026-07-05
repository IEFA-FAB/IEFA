import { useQueryClient } from "@tanstack/react-query"
import { Edit, PackagePlus, ShoppingCart, Trash2, Truck } from "lucide-react"
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
import { type PurchaseItemWithLink, useDeletePurchaseItemLink, usePurchaseItems } from "@/services/IngredientsService"
import { PurchaseItemForm } from "./PurchaseItemForm"

interface PurchaseItemsManagerProps {
	ingredientId: string
	/** Chamado após qualquer alteração (criar/editar/remover) para registrar uma versão do insumo. */
	onChanged?: () => void
}

interface DialogState {
	isOpen: boolean
	mode: "create" | "edit"
	item?: PurchaseItemWithLink
}

/** Resumo comercial em linha única, omitindo campos ausentes. */
function purchaseSummary(item: PurchaseItemWithLink): string {
	const parts: string[] = []
	if (item.purchase_measure_unit) parts.push(item.purchase_measure_unit)
	if (item.unit_price != null) parts.push(`R$ ${Number(item.unit_price).toFixed(2)}/un`)
	if (item.conversion_factor != null && Number(item.conversion_factor) !== 1) parts.push(`fc ${item.conversion_factor}`)
	return parts.join(" · ")
}

/**
 * Gerenciador de itens de compra (purchase_item) correlacionados a um insumo.
 * Modelo: catmat → purchase_item → ingredient (via purchase_item_ingredient).
 */
export function PurchaseItemsManager({ ingredientId, onChanged }: PurchaseItemsManagerProps) {
	const queryClient = useQueryClient()
	const { purchaseItems } = usePurchaseItems(ingredientId)
	const { deletePurchaseItemLink, isDeleting } = useDeletePurchaseItemLink()

	const [dialogState, setDialogState] = useState<DialogState>({ isOpen: false, mode: "create" })
	const [deleteTarget, setDeleteTarget] = useState<PurchaseItemWithLink | null>(null)

	const handleDeleteConfirm = async () => {
		if (!deleteTarget) return
		try {
			await deletePurchaseItemLink(deleteTarget.link_id)
			await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
			onChanged?.()
			toast.success("Correlação removida com sucesso!")
		} catch {
			toast.error("Erro ao remover correlação")
		} finally {
			setDeleteTarget(null)
		}
	}

	const openCreate = () => setDialogState({ isOpen: true, mode: "create" })
	const openEdit = (item: PurchaseItemWithLink) => setDialogState({ isOpen: true, mode: "edit", item })
	const closeDialog = () => setDialogState({ isOpen: false, mode: "create" })

	const isEmpty = !purchaseItems || purchaseItems.length === 0

	return (
		<section className="space-y-3">
			{/* Header da seção */}
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<ShoppingCart className="size-5 text-muted-foreground" />
						<h2 className="text-heading">Itens de Compra</h2>
						{purchaseItems && <Badge variant="secondary">{purchaseItems.length}</Badge>}
					</div>
					<p className="text-caption text-muted-foreground">Especificações de aquisição (CATMAT) deste insumo.</p>
				</div>
				<Button size="sm" onClick={openCreate} className="gap-2 shrink-0">
					<PackagePlus className="size-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
					<ShoppingCart className="size-10 opacity-30" />
					<p className="text-body">Nenhum item de compra cadastrado</p>
					<Button variant="outline" size="sm" onClick={openCreate}>
						<PackagePlus className="size-4 mr-2" />
						Adicionar primeiro item
					</Button>
				</div>
			) : (
				<ItemGroup>
					{purchaseItems?.map((item) => {
						const summary = purchaseSummary(item)
						return (
							<Item key={item.link_id} variant="outline">
								<ItemMedia variant="icon">
									<ShoppingCart className="text-muted-foreground" />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{item.description}</ItemTitle>
									<ItemDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
										{item.catmat_item_codigo != null && <span className="font-mono text-foreground">CATMAT {item.catmat_item_codigo}</span>}
										{item.catmat_item_codigo != null && summary && <span aria-hidden>·</span>}
										{summary && <span className="font-mono">{summary}</span>}
										{item.catmat_item_codigo == null && !summary && "Sem dados comerciais"}
									</ItemDescription>
									{item.detailed_description && <p className="text-caption text-muted-foreground whitespace-pre-line">{item.detailed_description}</p>}
									{item.delivery_conditioning && (
										<p className="flex items-start gap-1.5 text-caption text-muted-foreground">
											<Truck className="size-3.5 shrink-0 translate-y-0.5" />
											<span className="whitespace-pre-line">{item.delivery_conditioning}</span>
										</p>
									)}
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
										aria-label={`Remover ${item.description}`}
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

			{/* Dialog de criação/edição
			    key por item força remount → reinicializa o estado `catmat` (useState fora do form,
			    que não tem reset reativo de defaultValues como o useForm). Sem isso o CATMAT vaza
			    entre edições e pode apagar/sobrescrever o catmat do item ao salvar. */}
			<PurchaseItemForm
				key={dialogState.mode === "edit" ? dialogState.item?.id : "create"}
				isOpen={dialogState.isOpen}
				onClose={closeDialog}
				mode={dialogState.mode}
				purchaseItem={dialogState.item}
				ingredientId={ingredientId}
				onChanged={onChanged}
			/>

			{/* AlertDialog de confirmação de remoção */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Remover correlação</AlertDialogTitle>
						<AlertDialogDescription>
							Remover a correlação com <strong>{deleteTarget?.description}</strong> deste insumo? O item de compra é preservado (pode estar vinculado a outros
							insumos).
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
							{isDeleting ? "Removendo..." : "Remover"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}
