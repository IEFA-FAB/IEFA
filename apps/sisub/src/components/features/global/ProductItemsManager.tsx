import { Button, Card } from "@iefa/ui"
import { useQueryClient } from "@tanstack/react-query"
import { Edit, PackagePlus, ShoppingCart, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useDeleteProductItem, useProductItems } from "@/services/ProductsService"
import type { ProductItem } from "@/types/supabase.types"
import { ProductItemForm } from "./ProductItemForm"

interface ProductItemsManagerProps {
	productId: string
}

interface DialogState {
	isOpen: boolean
	mode: "create" | "edit"
	item?: ProductItem
}

/**
 * Gerenciador de itens de compra de um produto específico.
 * Responsabilidade única: listar, criar, editar e excluir itens de compra.
 */
export function ProductItemsManager({ productId }: ProductItemsManagerProps) {
	const queryClient = useQueryClient()
	const { productItems } = useProductItems(productId)
	const { deleteProductItem, isDeleting } = useDeleteProductItem()

	const [dialogState, setDialogState] = useState<DialogState>({
		isOpen: false,
		mode: "create",
	})

	const handleDelete = async (item: ProductItem) => {
		if (!confirm(`Tem certeza que deseja excluir "${item.description}"?`)) return
		try {
			await deleteProductItem(item.id)
			await queryClient.invalidateQueries({ queryKey: ["products"] })
			toast.success("Item excluído com sucesso!")
		} catch {
			toast.error("Erro ao excluir item")
		}
	}

	const openCreate = () => setDialogState({ isOpen: true, mode: "create" })
	const openEdit = (item: ProductItem) => setDialogState({ isOpen: true, mode: "edit", item })
	const closeDialog = () => setDialogState({ isOpen: false, mode: "create" })

	const isEmpty = !productItems || productItems.length === 0

	return (
		<div className="space-y-4">
			{/* Header da seção */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ShoppingCart className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
					<h2 className="text-lg font-semibold">Itens de Compra</h2>
					{productItems && (
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20">
							{productItems.length}
						</span>
					)}
				</div>
				<Button size="sm" onClick={openCreate} className="gap-2 transition-all active:scale-[0.98]">
					<PackagePlus className="w-4 h-4" />
					Novo Item
				</Button>
			</div>

			{/* Lista de itens */}
			<Card className="border border-border/50">
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
						{productItems?.map((item) => (
							<div
								key={item.id}
								className="group flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
							>
								<div className="flex items-center gap-3 min-w-0">
									<div className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 shrink-0">
										<ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
									</div>

									<div className="min-w-0">
										<p className="text-sm font-medium truncate">{item.description}</p>
										<div className="flex items-center gap-2 mt-0.5 flex-wrap">
											{item.barcode && (
												<span className="text-xs font-mono text-muted-foreground">
													#{item.barcode}
												</span>
											)}
											{item.purchase_measure_unit && (
												<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-muted/50 text-muted-foreground border border-border/30">
													{item.unit_content_quantity} {item.purchase_measure_unit}
												</span>
											)}
											{item.correction_factor && Number(item.correction_factor) !== 1 && (
												<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-muted/50 text-muted-foreground border border-border/30">
													fc {item.correction_factor}
												</span>
											)}
										</div>
									</div>
								</div>

								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 ml-2">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => openEdit(item)}
										disabled={isDeleting}
										aria-label={`Editar ${item.description}`}
										className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
									>
										<Edit className="w-3.5 h-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleDelete(item)}
										disabled={isDeleting}
										aria-label={`Excluir ${item.description}`}
										className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
									>
										<Trash2 className="w-3.5 h-3.5" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			<ProductItemForm
				isOpen={dialogState.isOpen}
				onClose={closeDialog}
				mode={dialogState.mode}
				productItem={dialogState.item}
				defaultProductId={productId}
			/>
		</div>
	)
}
