import type { IngredientItem } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateIngredientItem, useIngredients, useUpdateIngredientItem } from "@/services/IngredientsService"

// Schema de validação
const ingredientItemSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	ingredient_id: z.string().uuid("Selecione um insumo"),
	barcode: z.string(),
	purchase_measure_unit: z.string(),
	unit_content_quantity: z.number().min(0),
	correction_factor: z.number().min(0),
})

interface IngredientItemFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	ingredientItem?: IngredientItem
	defaultIngredientId?: string
}

export function IngredientItemForm({ isOpen, onClose, mode, ingredientItem, defaultIngredientId }: IngredientItemFormProps) {
	const queryClient = useQueryClient()
	const { ingredients } = useIngredients()
	const { createIngredientItem, isCreating } = useCreateIngredientItem()
	const { updateIngredientItem, isUpdating } = useUpdateIngredientItem()

	const form = useForm({
		defaultValues: {
			description: ingredientItem?.description || "",
			ingredient_id: ingredientItem?.ingredient_id || defaultIngredientId || "",
			barcode: ingredientItem?.barcode || "",
			purchase_measure_unit: ingredientItem?.purchase_measure_unit || "",
			unit_content_quantity: ingredientItem?.unit_content_quantity ? Number(ingredientItem.unit_content_quantity) : 1.0,
			correction_factor: ingredientItem?.correction_factor ? Number(ingredientItem.correction_factor) : 1.0,
		},
		validators: {
			onChange: ingredientItemSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createIngredientItem(value)
					toast.success("Item criado com sucesso!")
				} else if (ingredientItem) {
					await updateIngredientItem({
						id: ingredientItem.id,
						payload: value,
					})
					toast.success("Item atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["ingredients"],
				})

				onClose()
				form.reset()
			} catch (_error) {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
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

						{/* Insumo Genérico — só exibido fora do contexto de rota com insumo fixo */}
						{!defaultIngredientId && (
							<form.Field name="ingredient_id">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>
											Insumo Genérico <span className="text-destructive">*</span>
										</FieldLabel>
										<Select value={field.state.value} onValueChange={(value) => field.handleChange(value || "")}>
											<SelectTrigger>
												<SelectValue placeholder="Selecione um insumo">
													{field.state.value && (ingredients?.find((p) => p.id === field.state.value)?.description ?? field.state.value)}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{ingredients?.map((p) => (
													<SelectItem key={p.id} value={p.id}>
														{p.description}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
									</Field>
								)}
							</form.Field>
						)}

						{/* Código de Barras */}
						<form.Field name="barcode">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Código de Barras</FieldLabel>
									<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: 7891234567890" />
								</Field>
							)}
						</form.Field>

						{/* Unidade de compra + Qtd por unidade */}
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="purchase_measure_unit">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Unidade de Compra</FieldLabel>
										<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: SACO, CAIXA" />
										<FieldDescription>Embalagem do fornecedor</FieldDescription>
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
										<FieldDescription>Ex: 5kg por saco</FieldDescription>
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
