import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Edit, PackagePlus, ShoppingCart, Tag, Trash2 } from "lucide-react"
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
import { type PurchaseItemWithLink, useDeletePurchaseItemLink, usePurchaseItems } from "@/services/IngredientsService"
import { PurchaseItemForm } from "./PurchaseItemForm"

interface PurchaseItemsManagerProps {
	ingredientId: string
}

interface DialogState {
	isOpen: boolean
	mode: "create" | "edit"
	item?: PurchaseItemWithLink
}

/**
 * Gerenciador de itens de compra (purchase_item) correlacionados a um insumo.
 * Modelo: catmat → purchase_item → ingredient (via purchase_item_ingredient).
 */
export function PurchaseItemsManager({ ingredientId }: PurchaseItemsManagerProps) {
	const queryClient = useQueryClient()
	const { purchaseItems } = usePurchaseItems(ingredientId)
	const { deletePurchaseItemLink, isDeleting } = useDeletePurchaseItemLink()

	const [dialogState, setDialogState] = useState<DialogState>({ isOpen: false, mode: "create" })
	const [deleteTarget, setDeleteTarget] = useState<PurchaseItemWithLink | null>(null)
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
			await deletePurchaseItemLink(deleteTarget.link_id)
			await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
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
		<div className="space-y-4">
			{/* Header da seção */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ShoppingCart className="size-5 text-success" />
					<h2 className="text-heading">Itens de Compra</h2>
					{purchaseItems && <Badge variant="success">{purchaseItems.length}</Badge>}
				</div>
				<Button size="sm" onClick={openCreate} className="gap-2">
					<PackagePlus className="size-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			<Card>
				{isEmpty ? (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
						<ShoppingCart className="size-10 opacity-30" />
						<p className="font-sans">Nenhum item de compra cadastrado</p>
						<Button variant="outline" size="sm" onClick={openCreate}>
							<PackagePlus className="size-4 mr-2" />
							Adicionar primeiro item
						</Button>
					</div>
				) : (
					<div className="divide-y divide-border/50">
						{purchaseItems?.map((item) => (
							<Collapsible key={item.link_id} open={openItems.has(item.link_id)} onOpenChange={() => toggleItem(item.link_id)}>
								<div className="group flex items-center px-4 py-3 hover:bg-muted/50 transition-colors gap-2">
									<CollapsibleTrigger className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-none p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-[var(--radius)]">
										<div className="flex items-center justify-center size-8 rounded-[var(--radius)] bg-success/10 border border-success/20 shrink-0">
											<ShoppingCart className="size-4 text-success" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												<p className="text-subheading truncate">{item.description}</p>
												<ChevronDown
													className={cn("size-3.5 text-muted-foreground shrink-0 transition-transform", openItems.has(item.link_id) && "rotate-180")}
												/>
											</div>
											<div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
												{item.catmat_item_codigo != null && (
													<Badge variant="outline">
														<Tag className="size-3 mr-1" />
														<span className="font-mono">CATMAT {item.catmat_item_codigo}</span>
													</Badge>
												)}
												{item.purchase_measure_unit && (
													<Badge variant="outline">
														<span className="font-mono">{item.purchase_measure_unit}</span>
													</Badge>
												)}
												{item.unit_price != null && (
													<Badge variant="outline">
														<span className="font-mono">R$ {Number(item.unit_price).toFixed(2)}</span>
													</Badge>
												)}
												{item.conversion_factor != null && Number(item.conversion_factor) !== 1 && (
													<Badge variant="outline">
														<span className="font-mono">fc {item.conversion_factor}</span>
													</Badge>
												)}
											</div>
										</div>
									</CollapsibleTrigger>

									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 shrink-0">
										<Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} disabled={isDeleting} aria-label={`Editar ${item.description}`}>
											<Edit className="size-3.5" />
										</Button>
										<Button
											variant="destructive"
											size="icon-sm"
											onClick={() => setDeleteTarget(item)}
											disabled={isDeleting}
											aria-label={`Remover ${item.description}`}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								</div>

								<CollapsibleContent>
									<div className="px-4 pb-4 ml-11 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
										{item.catmat_item_codigo != null && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Código CATMAT</span>
												<span className="font-mono">{item.catmat_item_codigo}</span>
											</div>
										)}
										{item.catmat_item_descricao && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Descrição CATMAT</span>
												<span>{item.catmat_item_descricao}</span>
											</div>
										)}
										{item.purchase_measure_unit && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Unidade de compra</span>
												<span className="font-mono">{item.purchase_measure_unit}</span>
											</div>
										)}
										{item.unit_price != null && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Preço de referência</span>
												<span className="font-mono">R$ {Number(item.unit_price).toFixed(4)}</span>
											</div>
										)}
										{item.conversion_factor != null && (
											<div className="flex flex-col gap-0.5">
												<span className="text-xs text-muted-foreground">Fator de conversão</span>
												<span className="font-mono">{item.conversion_factor}</span>
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
			<PurchaseItemForm isOpen={dialogState.isOpen} onClose={closeDialog} mode={dialogState.mode} purchaseItem={dialogState.item} ingredientId={ingredientId} />

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
		</div>
	)
}
