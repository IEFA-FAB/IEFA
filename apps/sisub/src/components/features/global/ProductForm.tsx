import type { Product } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateProduct, useFolders, useUpdateProduct } from "@/services/ProductsService"

// Schema de validação
const productSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	folder_id: z.string().uuid("Selecione uma pasta").nullable(),
	measure_unit: z.string(),
	correction_factor: z.number().min(0),
})

const MEASURE_UNIT_LABELS: Record<string, string> = {
	UN: "UN (Unidade)",
	KG: "KG (Quilograma)",
	LT: "LT (Litro)",
	G: "G (Grama)",
	ML: "ML (Mililitro)",
}

interface ProductFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	product?: Product
	defaultFolderId?: string | null
}

export function ProductForm({ isOpen, onClose, mode, product, defaultFolderId }: ProductFormProps) {
	const queryClient = useQueryClient()
	const { folders } = useFolders()
	const { createProduct, isCreating } = useCreateProduct()
	const { updateProduct, isUpdating } = useUpdateProduct()

	const form = useForm({
		defaultValues: {
			description: product?.description || "",
			folder_id: product?.folder_id || defaultFolderId || null,
			measure_unit: product?.measure_unit || "",
			correction_factor: product?.correction_factor ? Number(product.correction_factor) : 1.0,
		},
		validators: {
			onChange: productSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createProduct(value)
					toast.success("Produto criado com sucesso!")
				} else if (product) {
					await updateProduct({ id: product.id, payload: value })
					toast.success("Produto atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["products"],
				})

				onClose()
				form.reset()
			} catch (_error) {
				toast.error(mode === "create" ? "Erro ao criar produto" : "Erro ao atualizar produto")
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo Produto" : "Editar Produto"}</DialogTitle>
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
										placeholder="Ex: Arroz Branco, Feijão Carioca"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Pasta */}
						<form.Field name="folder_id">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Pasta (Categoria)</FieldLabel>
									<Select
										value={field.state.value || "__SELECT__"}
										onValueChange={(value) => field.handleChange(value === "__SELECT__" || value === null ? null : value)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Selecione uma pasta">
												{field.state.value && field.state.value !== "__SELECT__"
													? (folders?.find((f) => f.id === field.state.value)?.description ?? "Sem Nome")
													: undefined}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__SELECT__">Selecione uma pasta</SelectItem>
											{folders?.map((f) => (
												<SelectItem key={f.id} value={f.id}>
													{f.description || "Sem Nome"}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Unidade de Medida */}
						<form.Field name="measure_unit">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Unidade de Medida</FieldLabel>
									<Select
										value={field.state.value || "__SELECT__"}
										onValueChange={(value) => field.handleChange(value === "__SELECT__" || value === null ? "" : value)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Selecione">
												{field.state.value && field.state.value !== "__SELECT__" ? (MEASURE_UNIT_LABELS[field.state.value] ?? field.state.value) : undefined}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__SELECT__">Selecione</SelectItem>
											<SelectItem value="UN">UN (Unidade)</SelectItem>
											<SelectItem value="KG">KG (Quilograma)</SelectItem>
											<SelectItem value="LT">LT (Litro)</SelectItem>
											<SelectItem value="G">G (Grama)</SelectItem>
											<SelectItem value="ML">ML (Mililitro)</SelectItem>
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>

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
									<p className="text-xs text-muted-foreground">Fator nutricional/correção (padrão: 1.0)</p>
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
