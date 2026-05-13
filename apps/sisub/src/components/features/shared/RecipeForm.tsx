import { useForm } from "@tanstack/react-form"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { IngredientSelector } from "@/components/features/shared/IngredientSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateRecipe, useVersionRecipe } from "@/hooks/data/useRecipeMutations"
import { cn } from "@/lib/cn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

// Schema Validation
const ingredientSchema = z.object({
	ingredient_id: z.string().uuid(),
	ingredient_name: z.string(), // Helper for UI
	measure_unit: z.string(), // Helper for UI
	net_quantity: z.number().min(0.001, "Quantidade deve ser maior que 0"),
	is_optional: z.boolean().default(false),
	priority_order: z.number().default(0),
})

const recipeSchema = z.object({
	name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
	preparation_method: z.string().default(""),
	portion_yield: z.number().min(1, "Rendimento deve ser pelo menos 1"),
	preparation_time_minutes: z.number().default(0),
	cooking_factor: z.number().default(1.0),
	ingredients: z.array(ingredientSchema).min(1, "Adicione pelo menos um ingrediente"),
})

interface IngredientFormItem {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	net_quantity: number | null
	is_optional: boolean
	priority_order: number
}

interface RecipeFormProps {
	initialData?: RecipeWithIngredients | null
	mode: "create" | "edit" | "fork"
}

export function RecipeForm({ initialData, mode }: RecipeFormProps) {
	"use no memo"
	const navigate = useNavigate()
	const { kitchenId } = useParams({ strict: false })

	const createMutation = useCreateRecipe()
	const versionMutation = useVersionRecipe()

	const [selectorOpen, setSelectorOpen] = useState(false)

	// Form setup
	const form = useForm({
		defaultValues: {
			name: initialData?.name || "",
			preparation_method: initialData?.preparation_method || "",
			portion_yield: initialData?.portion_yield || 1,
			preparation_time_minutes: initialData?.preparation_time_minutes || 0,
			cooking_factor: initialData?.cooking_factor || 1.0,
			ingredients:
				initialData?.ingredients?.map((ing) => ({
					ingredient_id: ing.ingredient_id,
					ingredient_name: ing.ingredient?.description || "Insumo Desconhecido",
					measure_unit: ing.ingredient?.measure_unit || "UN",
					net_quantity: ing.net_quantity,
					is_optional: ing.is_optional || false,
					priority_order: ing.priority_order || 0,
				})) || [],
		},
		onSubmit: async ({ value }) => {
			"use no memo"
			// Validate with Zod before submitting
			const validation = recipeSchema.safeParse(value)
			if (!validation.success) {
				toast.error("Preencha todos os campos obrigatórios corretamente")
				return
			}
			const isFork = mode === "fork"
			const kitchenIdNew = isFork ? 1 : null
			const baseRecipeId = isFork ? initialData?.id : undefined

			if (mode === "create" || isFork) {
				// Create recipe with ingredients handled separately
				const { ingredients, ...recipeData } = value

				await createMutation.mutateAsync({
					...recipeData,
					kitchen_id: kitchenIdNew, // TODO: Use real kitchen ID
					base_recipe_id: baseRecipeId,
				})
			} else if (mode === "edit" && initialData) {
				// Versioning: Insert new entry with incremented version
				const { ingredients, ...recipeData } = value

				await versionMutation.mutateAsync({
					baseRecipeId: initialData.id,
					newVersion: initialData.version + 1,
					data: {
						...recipeData,
						kitchen_id: initialData.kitchen_id,
					},
				})
			}

			toast.success("Preparação salva com sucesso!")
			if (kitchenId) {
				navigate({ to: "/kitchen/$kitchenId/recipes", params: { kitchenId } })
			} else {
				navigate({ to: "/global/recipes" })
			}
		},
	})

	// Dynamic Header Content
	const pageTitle = mode === "create" ? "Nova Preparação" : mode === "edit" ? `Editando: ${initialData?.name}` : `Personalizando: ${initialData?.name}`

	const pageBadge = mode === "edit" && initialData?.version != null ? <Badge variant="outline">v{initialData.version}</Badge> : undefined

	return (
		<div className="space-y-6 pb-20">
			<PageHeader
				title={pageTitle}
				badge={pageBadge}
				description={mode === "edit" ? "Uma nova versão será criada automaticamente." : undefined}
				onBack={() => window.history.back()}
			/>

			<form
				onSubmit={(e) => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="space-y-8 max-w-5xl mx-auto"
			>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{/* Main Info */}
					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Informações Básicas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="name">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel htmlFor="name">Nome da Preparação</FieldLabel>
										<FieldContent>
											<Input
												id="name"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>

							<form.Field name="preparation_method">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel htmlFor="prep">Modo de Preparo</FieldLabel>
										<FieldContent>
											<Textarea
												id="prep"
												className={cn("min-h-30", field.state.meta.errors.length > 0 && "border-destructive")}
												value={field.state.value || ""}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>

					{/* Metrics */}
					<Card>
						<CardHeader>
							<CardTitle>Métricas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="portion_yield">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel>Rendimento (Porções)</FieldLabel>
										<FieldContent>
											<Input
												type="number"
												min={1}
												value={field.state.value}
												className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
												onChange={(e) => field.handleChange(Number(e.target.value))}
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>
							<form.Field name="preparation_time_minutes">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel>Tempo de Preparo (min)</FieldLabel>
										<FieldContent>
											<Input
												type="number"
												value={field.state.value || 0}
												className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
												onChange={(e) => field.handleChange(Number(e.target.value))}
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>
							<form.Field name="cooking_factor">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel>Fator de Cocção (FC)</FieldLabel>
										<FieldContent>
											<Input
												type="number"
												step="0.01"
												value={field.state.value || 1}
												className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
												onChange={(e) => field.handleChange(Number(e.target.value))}
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>
				</div>

				{/* Ingredients */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle>Ingredientes</CardTitle>
						<Button type="button" variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
							<Plus className="w-4 h-4 mr-2" />
							Adicionar
						</Button>
					</CardHeader>
					<CardContent>
						<form.Field name="ingredients">
							{(field) => (
								<div className="space-y-4">
									{field.state.value.length === 0 ? (
										<div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">Nenhum ingrediente adicionado.</div>
									) : (
										field.state.value.map((ingredient: IngredientFormItem, index: number) => (
											<div key={ingredient.ingredient_id || index} className="grid grid-cols-12 gap-4 items-end p-3 border rounded-md bg-muted/20">
												<div className="col-span-5">
													<Label className="text-xs">Insumo</Label>
													<Input value={ingredient.ingredient_name} disabled className="bg-muted" />
												</div>
												<div className="col-span-3">
													<Label className="text-xs">Qtd. Líquida ({ingredient.measure_unit})</Label>
													<Input
														type="number"
														step="0.001"
														value={ingredient.net_quantity ?? 0}
														onChange={(e) => {
															const newList = [...field.state.value]
															newList[index].net_quantity = Number(e.target.value)
															field.handleChange(newList)
														}}
													/>
												</div>
												<div className="col-span-3 flex items-center gap-2 pb-2">
													<div className="flex items-center space-x-2">
														<span className="text-xs text-muted-foreground">Opcional?</span>
														<Input
															type="checkbox"
															className="w-4 h-4"
															checked={ingredient.is_optional}
															onChange={(e) => {
																const newList = [...field.state.value]
																newList[index].is_optional = e.target.checked
																field.handleChange(newList)
															}}
														/>
													</div>
												</div>
												<div className="col-span-1">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="text-destructive hover:bg-destructive/10"
														onClick={() => {
															const newList = field.state.value.filter((_: IngredientFormItem, i: number) => i !== index)
															field.handleChange(newList)
														}}
													>
														<Trash2 className="w-4 h-4" />
													</Button>
												</div>
											</div>
										))
									)}
									{field.state.meta.errors && <p className="text-destructive text-sm">{field.state.meta.errors.join()}</p>}
								</div>
							)}
						</form.Field>
					</CardContent>
				</Card>

				<div className="flex justify-end gap-4">
					<Button type="button" variant="outline" onClick={() => window.history.back()}>
						Cancelar
					</Button>
					<Button type="submit" disabled={createMutation.isPending || versionMutation.isPending}>
						{(createMutation.isPending || versionMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						<Save className="w-4 h-4 mr-2" />
						Salvar Preparação
					</Button>
				</div>
			</form>

			{/* Ingredient Selector Modal */}
			<IngredientSelector
				isOpen={selectorOpen}
				onClose={() => setSelectorOpen(false)}
				onSelect={(ingredient) => {
					form.pushFieldValue("ingredients", {
						ingredient_id: ingredient.id,
						ingredient_name: ingredient.description ?? "",
						measure_unit: ingredient.measure_unit ?? "UN",
						net_quantity: 0,
						is_optional: false,
						priority_order: form.getFieldValue("ingredients").length + 1,
					})
				}}
			/>
		</div>
	)
}
