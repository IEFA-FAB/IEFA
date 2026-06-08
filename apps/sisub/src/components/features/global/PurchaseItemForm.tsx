import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { type PurchaseItemWithLink, useCreatePurchaseItem, useUpdatePurchaseItem } from "@/services/IngredientsService"
import { CatmatCombobox } from "./CatmatCombobox"

const purchaseItemSchema = z.object({
	description: z.string().min(1, "Descrição obrigatória"),
	purchaseMeasureUnit: z.string(),
	unitPrice: z.number().min(0).nullable(),
	conversionFactor: z.number().min(0),
})

interface PurchaseItemFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	purchaseItem?: PurchaseItemWithLink
	ingredientId: string
}

export function PurchaseItemForm({ isOpen, onClose, mode, purchaseItem, ingredientId }: PurchaseItemFormProps) {
	const queryClient = useQueryClient()
	const { createPurchaseItem, isCreating } = useCreatePurchaseItem()
	const { updatePurchaseItem, isUpdating } = useUpdatePurchaseItem()

	// CATMAT controlado fora do form (código + descrição vêm juntos do combobox)
	const [catmat, setCatmat] = useState<{ codigo: number | null; descricao: string | null }>({
		codigo: purchaseItem?.catmat_item_codigo ?? null,
		descricao: purchaseItem?.catmat_item_descricao ?? null,
	})

	const form = useForm({
		defaultValues: {
			description: purchaseItem?.description ?? "",
			purchaseMeasureUnit: purchaseItem?.purchase_measure_unit ?? "",
			unitPrice: purchaseItem?.unit_price != null ? Number(purchaseItem.unit_price) : null,
			conversionFactor: purchaseItem?.conversion_factor != null ? Number(purchaseItem.conversion_factor) : 1.0,
		},
		validators: { onChange: purchaseItemSchema },
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createPurchaseItem({
						ingredientId,
						description: value.description,
						purchaseMeasureUnit: value.purchaseMeasureUnit || null,
						catmatItemCodigo: catmat.codigo,
						catmatItemDescricao: catmat.descricao,
						unitPrice: value.unitPrice,
						conversionFactor: value.conversionFactor,
					})
					toast.success("Item de compra criado com sucesso!")
				} else if (purchaseItem) {
					await updatePurchaseItem({
						id: purchaseItem.id,
						ingredientId,
						description: value.description,
						purchaseMeasureUnit: value.purchaseMeasureUnit || null,
						catmatItemCodigo: catmat.codigo,
						catmatItemDescricao: catmat.descricao,
						unitPrice: value.unitPrice,
						conversionFactor: value.conversionFactor,
						isDefault: purchaseItem.is_default,
					})
					toast.success("Item de compra atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
				onClose()
				form.reset()
			} catch {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo Item de Compra" : "Editar Item de Compra"}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						form.handleSubmit()
					}}
				>
					<FieldGroup className="gap-4">
						{/* Correlação CATMAT */}
						<Field>
							<FieldLabel>Correlação CATMAT</FieldLabel>
							<CatmatCombobox
								value={catmat.codigo}
								descricao={catmat.descricao}
								onChange={(codigo, descricao) => {
									setCatmat({ codigo, descricao })
									// auto-preenche a descrição do item se ainda vazia
									if (codigo != null && descricao && !form.getFieldValue("description")) {
										form.setFieldValue("description", descricao)
									}
								}}
							/>
							<FieldDescription>
								Consulte também em{" "}
								<a href="https://catalogo.compras.gov.br/cnbs-web/busca" target="_blank" rel="noopener noreferrer">
									catalogo.compras.gov.br
								</a>
							</FieldDescription>
						</Field>

						{/* Descrição */}
						<form.Field name="description">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>
										Descrição <span className="text-destructive">*</span>
									</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Ex: Arroz tipo 1, polido, longo fino"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Unidade de compra + Preço de referência */}
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="purchaseMeasureUnit">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Unidade de Compra</FieldLabel>
										<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: KG, SACO, CAIXA" />
									</Field>
								)}
							</form.Field>

							<form.Field name="unitPrice">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Preço de Referência</FieldLabel>
										<Input
											id={field.name}
											type="number"
											step="0.0001"
											value={field.state.value ?? ""}
											onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
											placeholder="0.0000"
										/>
										<FieldDescription>Preço unitário (R$)</FieldDescription>
									</Field>
								)}
							</form.Field>
						</div>

						{/* Fator de Conversão */}
						<form.Field name="conversionFactor">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Fator de Conversão</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="0.000001"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										placeholder="1.000000"
									/>
									<FieldDescription>Conversão da unidade de compra para a unidade do insumo (padrão: 1.0)</FieldDescription>
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					<DialogFooter className="mt-6">
						<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
