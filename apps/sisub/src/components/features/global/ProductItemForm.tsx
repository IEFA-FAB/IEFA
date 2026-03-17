import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useCreateProductItem, useProducts, useUpdateProductItem } from "@/services/ProductsService"
import type { ProductItem } from "@/types/supabase.types"

// Schema de validação
const productItemSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	product_id: z.string().uuid("Selecione um produto"),
	barcode: z.string(),
	purchase_measure_unit: z.string(),
	unit_content_quantity: z.number().min(0),
	correction_factor: z.number().min(0),
})

interface ProductItemFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	productItem?: ProductItem
	defaultProductId?: string
}

export function ProductItemForm({ isOpen, onClose, mode, productItem, defaultProductId }: ProductItemFormProps) {
	const queryClient = useQueryClient()
	const { products } = useProducts()
	const { createProductItem, isCreating } = useCreateProductItem()
	const { updateProductItem, isUpdating } = useUpdateProductItem()

	const form = useForm({
		defaultValues: {
			description: productItem?.description || "",
			product_id: productItem?.product_id || defaultProductId || "",
			barcode: productItem?.barcode || "",
			purchase_measure_unit: productItem?.purchase_measure_unit || "",
			unit_content_quantity: productItem?.unit_content_quantity ? Number(productItem.unit_content_quantity) : 1.0,
			correction_factor: productItem?.correction_factor ? Number(productItem.correction_factor) : 1.0,
		},
		validators: {
			onChange: productItemSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createProductItem(value)
					toast.success("Item criado com sucesso!")
				} else if (productItem) {
					await updateProductItem({
						id: productItem.id,
						payload: value,
					})
					toast.success("Item atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["products"],
				})

				onClose()
				form.reset()
			} catch (error) {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
				console.error(error)
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo Item de Compra" : "Editar Item"}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						form.handleSubmit()
					}}
				>
					<FieldGroup className="gap-4">
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
										placeholder="Ex: Arroz Marca X Saco 5kg"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Produto Genérico */}
						<form.Field name="product_id">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>
										Produto Genérico <span className="text-destructive">*</span>
									</FieldLabel>
									<Select value={field.state.value} onValueChange={(value) => field.handleChange(value || "")}>
										<option value="">Selecione um produto</option>
										{products?.map((p) => (
											<option key={p.id} value={p.id}>
												{p.description}
											</option>
										))}
									</Select>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Código de Barras */}
						<form.Field name="barcode">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Código de Barras</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Ex: 7891234567890"
									/>
								</Field>
							)}
						</form.Field>

						{/* Unidade de compra + Qtd por unidade */}
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="purchase_measure_unit">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Unidade de Compra</FieldLabel>
										<Input
											id={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Ex: SACO, CAIXA"
										/>
										<p className="text-xs text-muted-foreground">Embalagem do fornecedor</p>
									</Field>
								)}
							</form.Field>

							<form.Field name="unit_content_quantity">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Qtd por Unidade</FieldLabel>
										<Input
											id={field.name}
											type="number"
											step="0.0001"
											value={field.state.value}
											onChange={(e) => field.handleChange(Number(e.target.value))}
											placeholder="5.0"
										/>
										<p className="text-xs text-muted-foreground">Ex: 5kg por saco</p>
									</Field>
								)}
							</form.Field>
						</div>

						{/* Fator de Correção */}
						<form.Field name="correction_factor">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Fator de Correção</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="0.0001"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										placeholder="1.0000"
									/>
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
