import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { useCreateRecipe, useVersionRecipe } from "@/hooks/data/useRecipeMutations"
import type { RecipeWithIngredients } from "@/types/domain/recipes"
import { IngredientSelector } from "./IngredientSelector"

// Schema Validation
const ingredientSchema = z.object({
	product_id: z.string().uuid(),
	product_name: z.string(), // Helper for UI
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

interface RecipeFormProps {
	initialData?: RecipeWithIngredients | null
	mode: "create" | "edit" | "fork"
}

export function RecipeForm({ initialData, mode }: RecipeFormProps) {
	const navigate = useNavigate()

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
					product_id: ing.product_id,
					product_name: ing.product?.description || "Produto Desconhecido",
					measure_unit: ing.product?.measure_unit || "UN",
					net_quantity: ing.net_quantity,
					is_optional: ing.is_optional || false,
					priority_order: ing.priority_order || 0,
				})) || [],
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting
			const validation = recipeSchema.safeParse(value)
			if (!validation.success) {
				toast.error("Preencha todos os campos obrigatórios corretamente")
				return
			}
			try {
				if (mode === "create" || mode === "fork") {
					// Create recipe with ingredients handled separately
					const { ingredients, ...recipeData } = value

					await createMutation.mutateAsync({
						...recipeData,
						kitchen_id: mode === "fork" ? 1 : null, // TODO: Use real kitchen ID
						base_recipe_id: mode === "fork" ? initialData?.id : undefined,
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

				toast.success("Receita salva com sucesso!")
				navigate({ to: "/admin/recipes" }) // Go back to list
			} catch {
				// Error handled in hook/toast
			}
		},
	})

	// Dynamic Header Content
	const pageTitle =
		mode === "create"
			? "Nova Receita"
			: mode === "edit"
				? `Editando: ${initialData?.name} (v${initialData?.version})`
				: `Personalizando: ${initialData?.name}`

	const pageDescription =
		mode === "edit"
			? "Uma nova versão será criada automaticamente."
			: "Preencha os dados da ficha técnica."

	return (
		<div className="space-y-6 max-w-5xl mx-auto pb-20">
			<PageHeader
				title={pageTitle}
				description={pageDescription}
				onBack={() => window.history.back()}
			/>

			<form
				onSubmit={(e) => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="space-y-8"
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
									<div>
										<Label htmlFor="name">Nome da Receita</Label>
										<Input
											id="name"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										{field.state.meta.errors && (
											<span className="text-destructive text-sm">
												{field.state.meta.errors.join(",")}
											</span>
										)}
									</div>
								)}
							</form.Field>

							<form.Field name="preparation_method">
								{(field) => (
									<div>
										<Label htmlFor="prep">Modo de Preparo</Label>
										<Textarea
											id="prep"
											className="min-h-30"
											value={field.state.value || ""}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
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
									<div>
										<Label>Rendimento (Porções)</Label>
										<Input
											type="number"
											min={1}
											value={field.state.value}
											onChange={(e) => field.handleChange(Number(e.target.value))}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="preparation_time_minutes">
								{(field) => (
									<div>
										<Label>Tempo de Preparo (min)</Label>
										<Input
											type="number"
											value={field.state.value || 0}
											onChange={(e) => field.handleChange(Number(e.target.value))}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="cooking_factor">
								{(field) => (
									<div>
										<Label>Fator de Cocção (FC)</Label>
										<Input
											type="number"
											step="0.01"
											value={field.state.value || 1}
											onChange={(e) => field.handleChange(Number(e.target.value))}
										/>
									</div>
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
										<div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
											Nenhum ingrediente adicionado.
										</div>
									) : (
										field.state.value.map((ingredient, index) => (
											<div
												key={ingredient.product_id || index}
												className="grid grid-cols-12 gap-4 items-end p-3 border rounded-md bg-muted/20"
											>
												<div className="col-span-5">
													<Label className="text-xs">Produto</Label>
													<Input value={ingredient.product_name} disabled className="bg-muted" />
												</div>
												<div className="col-span-3">
													<Label className="text-xs">
														Qtd. Líquida ({ingredient.measure_unit})
													</Label>
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
															const newList = field.state.value.filter((_, i) => i !== index)
															field.handleChange(newList)
														}}
													>
														<Trash2 className="w-4 h-4" />
													</Button>
												</div>
											</div>
										))
									)}
									{field.state.meta.errors && (
										<p className="text-destructive text-sm">{field.state.meta.errors.join()}</p>
									)}
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
						{(createMutation.isPending || versionMutation.isPending) && (
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						)}
						<Save className="w-4 h-4 mr-2" />
						Salvar Receita
					</Button>
				</div>
			</form>

			{/* Ingredient Selector Modal */}
			<IngredientSelector
				isOpen={selectorOpen}
				onClose={() => setSelectorOpen(false)}
				onSelect={(product) => {
					form.pushFieldValue("ingredients", {
						product_id: product.id,
						product_name: product.description ?? "",
						measure_unit: product.measure_unit ?? "UN",
						net_quantity: 0,
						is_optional: false,
						priority_order: form.getFieldValue("ingredients").length + 1,
					})
				}}
			/>
		</div>
	)
}
