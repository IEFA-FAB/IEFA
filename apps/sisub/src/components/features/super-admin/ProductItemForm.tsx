import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
} from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
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

export function ProductItemForm({
	isOpen,
	onClose,
	mode,
	productItem,
	defaultProductId,
}: ProductItemFormProps) {
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
			unit_content_quantity: productItem?.unit_content_quantity
				? Number(productItem.unit_content_quantity)
				: 1.0,
			correction_factor: productItem?.correction_factor
				? Number(productItem.correction_factor)
				: 1.0,
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
					className="space-y-4"
				>
					{/* Descrição */}
					<form.Field name="description">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Descrição <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Ex: Arroz Marca X Saco 5kg"
									aria-invalid={!!field.state.meta.errors.length}
								/>
								{field.state.meta.errors && (
									<p className="text-sm text-destructive" role="alert">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
							</div>
						)}
					</form.Field>

					{/* Produto Genérico */}
					<form.Field name="product_id">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Produto Genérico <span className="text-destructive">*</span>
								</Label>
								<Select
									value={field.state.value}
									onValueChange={(value) => field.handleChange(value || "")}
								>
									<option value="">Selecione um produto</option>
									{products?.map((p) => (
										<option key={p.id} value={p.id}>
											{p.description}
										</option>
									))}
								</Select>
								{field.state.meta.errors && (
									<p className="text-sm text-destructive" role="alert">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
							</div>
						)}
					</form.Field>

					{/* Código de Barras */}
					<form.Field name="barcode">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Código de Barras</Label>
								<Input
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Ex: 7891234567890"
								/>
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						{/* Unidade de Compra */}
						<form.Field name="purchase_measure_unit">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Unidade de Compra</Label>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Ex: SACO, CAIXA"
									/>
									<p className="text-xs text-muted-foreground">Embalagem do fornecedor</p>
								</div>
							)}
						</form.Field>

						{/* Quantidade por Unidade */}
						<form.Field name="unit_content_quantity">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Qtd por Unidade</Label>
									<Input
										id={field.name}
										type="number"
										step="0.0001"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										placeholder="5.0"
									/>
									<p className="text-xs text-muted-foreground">Ex: 5kg por saco</p>
								</div>
							)}
						</form.Field>
					</div>

					{/* Fator de Correção */}
					<form.Field name="correction_factor">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Fator de Correção</Label>
								<Input
									id={field.name}
									type="number"
									step="0.0001"
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
									placeholder="1.0000"
								/>
							</div>
						)}
					</form.Field>

					<DialogFooter>
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
