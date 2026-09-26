import { useQueryClient } from "@tanstack/react-query"
import { PackagePlus, ShoppingCart, Truck } from "lucide-react"
import { useState } from "react"
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
import { toast } from "@/components/ui/toast"
import { useItemCards } from "@/hooks/forms/useItemCards"
import { type PurchaseItemWithLink, useDeletePurchaseItemLink, usePurchaseItems } from "@/services/IngredientsService"
import { CollapsibleItemCard } from "../shared/CollapsibleItemCard"
import { PURCHASE_ITEM_DRAFT_PREFIX, PurchaseItemEditor } from "./PurchaseItemEditor"

interface PurchaseItemsManagerProps {
	ingredientId: string
	ingredientName: string
	ingredientHref: string
	/** Chamado após qualquer alteração (criar/editar/remover) para registrar uma versão do insumo. */
	onChanged?: () => void
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
 *
 * Cada item edita no próprio card (um aberto por vez). Fechar o card não perde a edição:
 * o rascunho fica guardado e o card mostra "Rascunho não salvo" até salvar ou descartar.
 */
export function PurchaseItemsManager({ ingredientId, ingredientName, ingredientHref, onChanged }: PurchaseItemsManagerProps) {
	const queryClient = useQueryClient()
	const { purchaseItems } = usePurchaseItems(ingredientId)
	const { deletePurchaseItemLink, isDeleting } = useDeletePurchaseItemLink()
	const cards = useItemCards(PURCHASE_ITEM_DRAFT_PREFIX, ingredientId)
	const [deleteTarget, setDeleteTarget] = useState<PurchaseItemWithLink | null>(null)

	const handleDeleteConfirm = async () => {
		if (!deleteTarget) return
		try {
			await deletePurchaseItemLink(deleteTarget.link_id)
			cards.forget(deleteTarget.id)
			await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
			onChanged?.()
			toast.success("Correlação removida com sucesso!")
		} catch {
			toast.error("Erro ao remover correlação")
		} finally {
			setDeleteTarget(null)
		}
	}

	const isEmpty = (!purchaseItems || purchaseItems.length === 0) && !cards.showNewCard

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
				<Button size="sm" onClick={() => cards.open("new")} className="gap-2 shrink-0">
					<PackagePlus className="size-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
					<ShoppingCart className="size-10 opacity-30" />
					<p className="text-body">Nenhum item de compra cadastrado</p>
					<Button variant="outline" size="sm" onClick={() => cards.open("new")}>
						<PackagePlus className="size-4 mr-2" />
						Adicionar primeiro item
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{cards.showNewCard && (
						<CollapsibleItemCard
							open={cards.isOpen("new")}
							onOpenChange={cards.toggle("new")}
							icon={<PackagePlus className="text-muted-foreground" />}
							title="Novo item de compra"
							hasDraft={cards.hasNewDraft}
							itemLabel="novo item de compra"
						>
							<PurchaseItemEditor
								mode="create"
								ingredientId={ingredientId}
								ingredientName={ingredientName}
								ingredientHref={ingredientHref}
								onClose={cards.close}
								onChanged={onChanged}
							/>
						</CollapsibleItemCard>
					)}
					{purchaseItems?.map((item) => {
						const summary = purchaseSummary(item)
						return (
							<CollapsibleItemCard
								key={item.link_id}
								open={cards.isOpen(item.id)}
								onOpenChange={cards.toggle(item.id)}
								icon={<ShoppingCart className="text-muted-foreground" />}
								title={item.description}
								description={
									<>
										{item.catmat_item_codigo != null && <span className="font-mono text-foreground">CATMAT {item.catmat_item_codigo}</span>}
										{item.catmat_item_codigo != null && summary && <span aria-hidden>·</span>}
										{summary && <span className="font-mono">{summary}</span>}
										{item.catmat_item_codigo == null && !summary && "Sem dados comerciais"}
									</>
								}
								details={
									<>
										{item.detailed_description && <p className="text-caption text-muted-foreground whitespace-pre-line">{item.detailed_description}</p>}
										{item.delivery_conditioning && (
											<p className="flex items-start gap-1.5 text-caption text-muted-foreground">
												<Truck className="size-3.5 shrink-0 translate-y-0.5" />
												<span className="whitespace-pre-line">{item.delivery_conditioning}</span>
											</p>
										)}
									</>
								}
								hasDraft={cards.hasDraft(item.id)}
								itemLabel={item.description}
								onDelete={() => setDeleteTarget(item)}
								disabled={isDeleting}
							>
								<PurchaseItemEditor
									mode="edit"
									purchaseItem={item}
									ingredientId={ingredientId}
									ingredientName={ingredientName}
									ingredientHref={ingredientHref}
									onClose={cards.close}
									onChanged={onChanged}
								/>
							</CollapsibleItemCard>
						)
					})}
				</div>
			)}

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
