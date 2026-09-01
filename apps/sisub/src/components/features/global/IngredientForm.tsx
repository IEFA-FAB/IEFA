import type { Folder, Ingredient } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateIngredient, useFolders, useUpdateIngredient } from "@/services/IngredientsService"
import { FolderCombobox } from "./FolderCombobox"

// Schema de validação
/**
 * Um schema por escopo, não dois formatos: o `folder_id` continua `nullable` nos dois
 * (é como o valor existe no formulário), e a aba de itens auxiliares acrescenta um
 * `refine` exigindo a escolha.
 *
 * A pasta é obrigatória ali porque o escopo de catálogo MORA na pasta
 * (`kitchen.folder.catalog_scope`, ver `catalog-scope.ts`): item sem pasta é lido como
 * gênero de alimentação, ou seja, salvar sem escolher faria o item nascer na aba oposta
 * à que o usuário está olhando, sem erro nenhum.
 */
function buildProductSchema(catalog: "exclude" | "only") {
	return z
		.object({
			description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
			folder_id: z.string().uuid("Selecione uma pasta").nullable(),
			measure_unit: z.string(),
			correction_factor: z.number().min(0),
		})
		.refine((value) => catalog !== "only" || value.folder_id !== null, { message: "Selecione uma pasta", path: ["folder_id"] })
}

const MEASURE_UNIT_LABELS: Record<string, string> = {
	UN: "UN (Unidade)",
	KG: "KG (Quilograma)",
	LT: "LT (Litro)",
	G: "G (Grama)",
	ML: "ML (Mililitro)",
}

interface IngredientFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	ingredient?: Ingredient
	defaultFolderId?: string | null
	/**
	 * Aba de origem — recorta as pastas oferecidas no combo. Sem isto, criar um item
	 * pela aba "Itens auxiliares" ofereceria as 139 pastas de gêneros junto, e a
	 * escolha errada faz o item nascer na aba oposta à que o usuário está olhando.
	 */
	catalog?: "exclude" | "only"
}

export function IngredientForm({ isOpen, onClose, mode, ingredient, defaultFolderId, catalog = "exclude" }: IngredientFormProps) {
	const queryClient = useQueryClient()
	const { folders } = useFolders(catalog)
	const { createIngredient, isCreating } = useCreateIngredient()
	const { updateIngredient, isUpdating } = useUpdateIngredient()
	const productSchema = useMemo(() => buildProductSchema(catalog), [catalog])

	// Caminho hierárquico de cada pasta (ex.: "Hortifruti / Frutas / Cítricas") — exibe a
	// estrutura e permite busca por qualquer parte do caminho no combobox.
	const folderOptions = useMemo(() => {
		const list = folders ?? []
		const byId = new Map(list.map((f) => [f.id, f]))
		const pathOf = (f: Folder): string => {
			const parts: string[] = []
			let cur: Folder | undefined = f
			const seen = new Set<string>()
			while (cur && !seen.has(cur.id)) {
				seen.add(cur.id)
				parts.unshift(cur.description ?? "Sem Nome")
				cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
			}
			return parts.join(" / ")
		}
		return list.map((f) => ({ id: f.id, path: pathOf(f) })).sort((a, b) => a.path.localeCompare(b.path, "pt-BR"))
	}, [folders])

	const form = useForm({
		defaultValues: {
			description: ingredient?.description || "",
			folder_id: ingredient?.folder_id || defaultFolderId || null,
			measure_unit: ingredient?.measure_unit || "",
			correction_factor: ingredient?.correction_factor ? Number(ingredient.correction_factor) : 1.0,
		},
		validators: {
			onChange: productSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createIngredient(value)
					toast.success("Insumo criado com sucesso!")
				} else if (ingredient) {
					await updateIngredient({ id: ingredient.id, payload: value })
					toast.success("Insumo atualizado com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["ingredients"],
				})

				onClose()
				form.reset()
			} catch (_error) {
				toast.error(mode === "create" ? "Erro ao criar insumo" : "Erro ao atualizar insumo")
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo Insumo" : "Editar Insumo"}</DialogTitle>
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
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
								</Field>
							)}
						</form.Field>

						{/* Pasta */}
						<form.Field name="folder_id">
							{(field) => {
								return (
									<Field>
										<FieldLabel htmlFor={field.name}>Pasta (Categoria)</FieldLabel>
										<FolderCombobox value={field.state.value ?? null} onChange={(id) => field.handleChange(id)} options={folderOptions} />
										<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
									</Field>
								)
							}}
						</form.Field>

						{/* Unidade de Medida */}
						<form.Field name="measure_unit">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Unidade de Medida</FieldLabel>
									<Select value={field.state.value || null} onValueChange={(value) => field.handleChange(value ?? "")}>
										<SelectTrigger>
											<SelectValue placeholder="Selecione">
												{field.state.value ? (MEASURE_UNIT_LABELS[field.state.value] ?? field.state.value) : undefined}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
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
