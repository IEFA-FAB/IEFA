import type { IngredientItem } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { Tag } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateIngredientItem, useIngredients, usePurchaseItems, useUpdateIngredientItem } from "@/services/IngredientsService"

// Schema de validação
const ingredientItemSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	ingredient_id: z.string().uuid("Selecione um insumo"),
	barcode: z.string(),
	purchase_measure_unit: z.string(),
	unit_content_quantity: z.number().min(0),
	correction_factor: z.number().min(0),
	purchase_item_id: z.string().uuid().nullable(),
})

interface IngredientItemFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	ingredientItem?: IngredientItem
	defaultIngredientId?: string
	/** Registra uma versão do insumo após salvar. */
	onChanged?: () => void
}

export function IngredientItemForm({ isOpen, onClose, mode, ingredientItem, defaultIngredientId, onChanged }: IngredientItemFormProps) {
	const queryClient = useQueryClient()
	const { ingredients } = useIngredients()
	const { createIngredientItem, isCreating } = useCreateIngredientItem()
	const { updateIngredientItem, isUpdating } = useUpdateIngredientItem()
	// Itens de compra disponíveis para vincular (escopados ao insumo da tela)
	const { purchaseItems } = usePurchaseItems(defaultIngredientId ?? "")

	const form = useForm({
		defaultValues: {
			description: ingredientItem?.description || "",
			ingredient_id: ingredientItem?.ingredient_id || defaultIngredientId || "",
			barcode: ingredientItem?.barcode || "",
			purchase_measure_unit: ingredientItem?.purchase_measure_unit || "",
			unit_content_quantity: ingredientItem?.unit_content_quantity ? Number(ingredientItem.unit_content_quantity) : 1.0,
			correction_factor: ingredientItem?.correction_factor ? Number(ingredientItem.correction_factor) : 1.0,
			purchase_item_id: ingredientItem?.purchase_item_id ?? null,
		},
		validators: {
			onChange: ingredientItemSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createIngredientItem(value)
					toast.success("Item de produto criado com sucesso!")
				} else if (ingredientItem) {
					await updateIngredientItem({
						id: ingredientItem.id,
						payload: value,
					})
					toast.success("Item de produto atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["ingredients"],
				})
				onChanged?.()

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
					<DialogTitle>{mode === "create" ? "Novo Item de Produto" : "Editar Item de Produto"}</DialogTitle>
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

						{/* Item de Compra vinculado (herda o CATMAT) */}
						{defaultIngredientId && (
							<form.Field name="purchase_item_id">
								{(field) => {
									const selected = purchaseItems?.find((pi) => pi.id === field.state.value)
									return (
										<Field>
											<FieldLabel>Item de Compra (CATMAT)</FieldLabel>
											<Select value={field.state.value ?? "__NONE__"} onValueChange={(v) => field.handleChange(v === "__NONE__" || v == null ? null : v)}>
												<SelectTrigger>
													<SelectValue placeholder="Vincular item de compra">{field.state.value && selected ? selected.description : undefined}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__NONE__">Sem item de compra</SelectItem>
													{purchaseItems?.map((pi) => (
														<SelectItem key={pi.id} value={pi.id}>
															{pi.description}
															{pi.catmat_item_codigo != null ? ` — CATMAT ${pi.catmat_item_codigo}` : ""}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FieldDescription>
												{selected?.catmat_item_codigo != null ? (
													<span className="inline-flex items-center gap-1">
														<Tag className="size-3" />
														CATMAT {selected.catmat_item_codigo}
														{selected.catmat_item_descricao ? ` — ${selected.catmat_item_descricao}` : ""}
													</span>
												) : (
													"O item de produto herda o CATMAT do item de compra vinculado"
												)}
											</FieldDescription>
										</Field>
									)
								}}
							</form.Field>
						)}

						{/* Código de Barras (GTIN / GS1) */}
						<form.Field name="barcode">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Código de Barras (GTIN)</FieldLabel>
									<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: 7891234567890" />
									<FieldDescription>Código GS1/GTIN do produto físico em estoque</FieldDescription>
								</Field>
							)}
						</form.Field>

						{/* Unidade de compra + Qtd por unidade */}
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="purchase_measure_unit">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={field.name}>Unidade de Embalagem</FieldLabel>
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
