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
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodValidator } from "@tanstack/zod-form-adapter"
import { toast } from "sonner"
import { z } from "zod"
import { useCreateProduct, useFolders, useUpdateProduct } from "@/services/ProductsService"
import type { Product } from "@/types/supabase.types"

// Schema de validação
const productSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	folder_id: z.string().uuid("Selecione uma pasta").nullable(),
	measure_unit: z.string().optional(),
	correction_factor: z.number().min(0).optional(),
})

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
		// @ts-expect-error - TanStack Form type issue with validatorAdapter
		validatorAdapter: zodValidator(),
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
			} catch (error) {
				toast.error(mode === "create" ? "Erro ao criar produto" : "Erro ao atualizar produto")
				console.error(error)
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
									placeholder="Ex: Arroz Branco, Feijão Carioca"
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

					{/* Pasta */}
					<form.Field name="folder_id">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Pasta (Categoria)</Label>
								<Select
									value={field.state.value || "__SELECT__"}
									onValueChange={(value) =>
										field.handleChange(value === "__SELECT__" ? null : value)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Selecione uma pasta" />
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
								{field.state.meta.errors && (
									<p className="text-sm text-destructive" role="alert">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
							</div>
						)}
					</form.Field>

					{/* Unidade de Medida */}
					<form.Field name="measure_unit">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Unidade de Medida</Label>
								<Select
									value={field.state.value || "__SELECT__"}
									onValueChange={(value) => field.handleChange(value === "__SELECT__" ? "" : value)}
								>
									<SelectTrigger>
										<SelectValue placeholder="Selecione" />
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
							</div>
						)}
					</form.Field>

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
								<p className="text-xs text-muted-foreground">
									Fator nutricional/correção (padrão: 1.0)
								</p>
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
