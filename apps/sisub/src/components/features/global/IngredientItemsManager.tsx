import { useQueryClient } from "@tanstack/react-query"
import { Boxes, Link2, PackagePlus } from "lucide-react"
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
import { useOpenDrafts } from "@/hooks/forms/useDraft"
import { draftStore } from "@/lib/drafts/draft-store"
import { type IngredientItemWithPurchase, useDeleteIngredientItem, useIngredientItems } from "@/services/IngredientsService"
import { CollapsibleItemCard } from "../shared/CollapsibleItemCard"
import { IngredientItemEditor } from "./IngredientItemEditor"

interface IngredientItemsManagerProps {
	ingredientId: string
	ingredientName: string
	ingredientHref: string
	/** Chamado após qualquer alteração (criar/editar/remover) para registrar uma versão do insumo. */
	onChanged?: () => void
}

/** Card aberto: o id do item, "new" para o item em criação, ou nenhum. */
type OpenCard = string | null

const draftKey = (id: string) => `sisub:ingredient-item:${id}`

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
 * Mesmo padrão dos itens de compra: edição no próprio card, um aberto por vez, rascunho
 * que sobrevive a fechar o card.
 */
export function IngredientItemsManager({ ingredientId, ingredientName, ingredientHref, onChanged }: IngredientItemsManagerProps) {
	const queryClient = useQueryClient()
	const { ingredientItems } = useIngredientItems(ingredientId)
	const { deleteIngredientItem, isDeleting } = useDeleteIngredientItem()
	const drafts = new Set(useOpenDrafts().map((draft) => draft.key))

	const [openCard, setOpenCard] = useState<OpenCard>(null)
	const [deleteTarget, setDeleteTarget] = useState<IngredientItemWithPurchase | null>(null)

	const newDraftKey = draftKey(`new:${ingredientId}`)
	const showNewCard = openCard === "new" || drafts.has(newDraftKey)

	const handleDeleteConfirm = async () => {
		if (!deleteTarget) return
		try {
			await deleteIngredientItem(deleteTarget.id)
			draftStore.delete(draftKey(deleteTarget.id))
			if (openCard === deleteTarget.id) setOpenCard(null)
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
			onChanged?.()
			toast.success("Item de produto excluído com sucesso!")
		} catch {
			toast.error("Erro ao excluir item")
		} finally {
			setDeleteTarget(null)
		}
	}

	const toggle = (card: string) => (open: boolean) => setOpenCard(open ? card : null)
	const isEmpty = (!ingredientItems || ingredientItems.length === 0) && !showNewCard

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
				<Button size="sm" onClick={() => setOpenCard("new")} className="gap-2 shrink-0">
					<PackagePlus className="size-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
					<Boxes className="size-10 opacity-30" />
					<p className="text-body">Nenhum item de produto cadastrado</p>
					<Button variant="outline" size="sm" onClick={() => setOpenCard("new")}>
						<PackagePlus className="size-4 mr-2" />
						Adicionar primeiro item
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{showNewCard && (
						<CollapsibleItemCard
							open={openCard === "new"}
							onOpenChange={toggle("new")}
							icon={<PackagePlus className="text-muted-foreground" />}
							title="Novo item de produto"
							hasDraft={drafts.has(newDraftKey)}
							itemLabel="novo item de produto"
						>
							<IngredientItemEditor
								mode="create"
								ingredientId={ingredientId}
								ingredientName={ingredientName}
								ingredientHref={ingredientHref}
								onClose={() => setOpenCard(null)}
								onChanged={onChanged}
							/>
						</CollapsibleItemCard>
					)}
					{ingredientItems?.map((item) => {
						const summary = stockSummary(item)
						const linked = item.purchase_item
						return (
							<CollapsibleItemCard
								key={item.id}
								open={openCard === item.id}
								onOpenChange={toggle(item.id)}
								icon={<Boxes className="text-muted-foreground" />}
								title={item.description}
								description={
									<>
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
										{summary && <span className="block w-full font-mono">{summary}</span>}
									</>
								}
								hasDraft={drafts.has(draftKey(item.id))}
								itemLabel={item.description ?? "item de produto"}
								onDelete={() => setDeleteTarget(item)}
								deleteLabel="Excluir"
								disabled={isDeleting}
							>
								<IngredientItemEditor
									mode="edit"
									ingredientItem={item}
									ingredientId={ingredientId}
									ingredientName={ingredientName}
									ingredientHref={ingredientHref}
									onClose={() => setOpenCard(null)}
									onChanged={onChanged}
								/>
							</CollapsibleItemCard>
						)
					})}
				</div>
			)}

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
