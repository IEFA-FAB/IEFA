import { useForm } from "@tanstack/react-form"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Circle, CircleCheck, Loader2, Pencil, Plus, Replace, Save, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { IngredientSelector } from "@/components/features/shared/IngredientSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { useCreateRecipe, useVersionRecipe } from "@/hooks/data/useRecipeMutations"
import { cn } from "@/lib/cn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

// Schema Validation
const alternativeSchema = z.object({
	ingredient_id: z.string().uuid(),
	ingredient_name: z.string(), // Helper for UI
	measure_unit: z.string(), // Helper for UI
	net_quantity: z.number().min(0.001, "Quantidade deve ser maior que 0"),
	priority_order: z.number().default(0),
})

const ingredientSchema = z.object({
	ingredient_id: z.string().uuid(),
	ingredient_name: z.string(), // Helper for UI
	measure_unit: z.string(), // Helper for UI
	net_quantity: z.number().min(0.001, "Quantidade deve ser maior que 0"),
	is_optional: z.boolean().default(false),
	priority_order: z.number().default(0),
	alternatives: z.array(alternativeSchema).default([]),
})

const recipeSchema = z.object({
	name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
	preparation_method: z.string().default(""),
	portion_yield: z.number().min(1, "Rendimento deve ser pelo menos 1"),
	preparation_time_minutes: z.number().default(0),
	cooking_factor: z.number().min(0.01, "FC mínimo é 0,01").max(20, "FC máximo é 20").default(1.0),
	ingredients: z.array(ingredientSchema).min(1, "Adicione pelo menos um ingrediente"),
})

interface AlternativeFormItem {
	ingredient_id: string
	ingredient_name: string
	measure_unit: string
	net_quantity: number | null
	priority_order: number
}

interface IngredientFormItem {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	net_quantity: number | null
	is_optional: boolean
	priority_order: number
	alternatives: AlternativeFormItem[]
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
	// Índice do ingrediente que receberá a próxima substituição escolhida no selector (null = adicionando ingrediente principal)
	const [altTargetIndex, setAltTargetIndex] = useState<number | null>(null)

	const handleBack = () => {
		if (kitchenId) {
			navigate({ to: "/kitchen/$kitchenId/recipes", params: { kitchenId } })
		} else {
			navigate({ to: "/global/recipes" })
		}
	}

	// Form setup
	const form = useForm({
		defaultValues: {
			name: initialData?.name || "",
			preparation_method: initialData?.preparation_method || "",
			portion_yield: initialData?.portion_yield || 1,
			preparation_time_minutes: initialData?.preparation_time_minutes ?? 0,
			cooking_factor: initialData?.cooking_factor || 1.0,
			ingredients:
				initialData?.ingredients?.map((ing) => ({
					ingredient_id: ing.ingredient_id,
					ingredient_name: ing.ingredient?.description || "Insumo Desconhecido",
					measure_unit: ing.ingredient?.measure_unit || "UN",
					net_quantity: ing.net_quantity,
					is_optional: ing.is_optional || false,
					priority_order: ing.priority_order || 0,
					alternatives:
						ing.alternatives?.map((alt) => ({
							ingredient_id: alt.ingredient_id ?? "",
							ingredient_name: alt.ingredient?.description || "Insumo Desconhecido",
							measure_unit: alt.ingredient?.measure_unit || "UN",
							net_quantity: alt.net_quantity,
							priority_order: alt.priority_order || 0,
						})) ?? [],
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
			// Fork é sempre local a uma cozinha (rota /kitchen/$kitchenId/...); kitchenId vem da URL como string.
			const kitchenIdNew = isFork && kitchenId ? Number(kitchenId) : null
			const baseRecipeId = isFork ? initialData?.id : undefined

			const mappedIngredients = value.ingredients
				.filter((i): i is typeof i & { ingredient_id: string; net_quantity: number } => i.ingredient_id !== null && i.net_quantity !== null)
				.map((i) => ({
					ingredient_id: i.ingredient_id,
					net_quantity: i.net_quantity,
					is_optional: i.is_optional,
					priority_order: i.priority_order,
					alternatives: (i.alternatives ?? [])
						.filter((a): a is typeof a & { ingredient_id: string; net_quantity: number } => !!a.ingredient_id && a.net_quantity != null && a.net_quantity > 0)
						.map((a) => ({
							ingredient_id: a.ingredient_id,
							net_quantity: a.net_quantity,
							priority_order: a.priority_order,
						})),
				}))

			if (mode === "create" || isFork) {
				const { ingredients: _ingredients, ...recipeData } = value

				await createMutation.mutateAsync({
					...recipeData,
					kitchen_id: kitchenIdNew,
					base_recipe_id: baseRecipeId,
					ingredients: mappedIngredients,
				})
			} else if (mode === "edit" && initialData) {
				const { ingredients: _ingredients, ...recipeData } = value

				await versionMutation.mutateAsync({
					baseRecipeId: initialData.id,
					newVersion: initialData.version + 1,
					data: {
						...recipeData,
						kitchen_id: initialData.kitchen_id,
						ingredients: mappedIngredients,
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

	const isPending = createMutation.isPending || versionMutation.isPending

	// Contexto do modo — distinto do nome (editado no título da página)
	const modeBadge =
		mode === "edit" && initialData?.version != null ? (
			<Badge variant="outline">v{initialData.version}</Badge>
		) : mode === "fork" ? (
			<Badge variant="secondary">Personalização</Badge>
		) : undefined

	const saveCaption =
		mode === "edit"
			? "Salvar gera automaticamente uma nova versão desta preparação."
			: mode === "fork"
				? "Salvar gera uma nova preparação personalizada a partir desta."
				: "Salvar cria a preparação."

	return (
		<div className="space-y-6">
			<PageHeader
				title={
					<form.Field name="name">
						{(field) => (
							<span className="group/title inline-flex max-w-full items-center gap-1.5">
								<input
									aria-label="Nome da preparação"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Nome da preparação"
									className={cn(
										"text-heading leading-tight text-foreground bg-transparent",
										"field-sizing-content min-w-[10ch] max-w-full",
										"-mx-2 rounded-md px-2 py-0.5",
										"outline-none transition-colors hover:bg-muted/60 focus:bg-muted/60",
										"focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60"
									)}
								/>
								<Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100" />
							</span>
						)}
					</form.Field>
				}
				badge={modeBadge}
				onBack={handleBack}
			/>

			<div className="max-w-5xl mx-auto space-y-8 pb-24">
				<form
					id="recipe-form"
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-6"
				>
					{/* Rendimento e cocção — parâmetros que dimensionam a preparação */}
					<Card>
						<CardHeader>
							<CardTitle>Rendimento e cocção</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<form.Field name="portion_yield">
									{(field) => (
										<Field data-invalid={field.state.meta.errors.length > 0}>
											<FieldLabel htmlFor="portion_yield">Rendimento (Porções)</FieldLabel>
											<FieldContent>
												<Input
													id="portion_yield"
													type="number"
													min={1}
													value={field.state.value}
													className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
													onChange={(e) => field.handleChange(Number(e.target.value))}
												/>
												<FieldDescription>Base para custo e escala das quantidades.</FieldDescription>
												<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
											</FieldContent>
										</Field>
									)}
								</form.Field>

								<form.Field name="preparation_time_minutes">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="preparation_time_minutes">Tempo de Preparo (min)</FieldLabel>
											<FieldContent>
												<Input
													id="preparation_time_minutes"
													type="number"
													min={0}
													value={field.state.value ?? 0}
													onChange={(e) => field.handleChange(Number(e.target.value))}
												/>
											</FieldContent>
										</Field>
									)}
								</form.Field>
							</div>

							<form.Field name="cooking_factor">
								{(field) => (
									<Field orientation="horizontal" data-invalid={field.state.meta.errors.length > 0} className="border-t border-border/60 pt-4">
										<FieldContent>
											<FieldLabel htmlFor="cooking_factor">Fator de Cocção (FC)</FieldLabel>
											<FieldDescription>
												Parâmetro avançado: 1,0 = sem perda de massa; acima disso o alimento perde peso ao cozinhar (ex.: frango ≈ 1,33). Faixa usual: 0,5–2,0.
											</FieldDescription>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />
										</FieldContent>
										<Input
											id="cooking_factor"
											type="number"
											step="0.01"
											placeholder="1,0"
											value={field.state.value || 1}
											className={cn("w-28 shrink-0", field.state.meta.errors.length > 0 && "border-destructive")}
											onChange={(e) => field.handleChange(Number(e.target.value))}
										/>
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>

					{/* Ingredientes — núcleo da preparação */}
					<form.Field name="ingredients">
						{(field) => (
							<Card>
								<CardHeader className="flex flex-row items-center justify-between">
									<div className="flex items-center gap-2">
										<CardTitle>Ingredientes</CardTitle>
										{field.state.value.length > 0 && <Badge variant="secondary">{field.state.value.length}</Badge>}
									</div>
									<Button type="button" variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
										<Plus className="size-4 mr-2" />
										Adicionar
									</Button>
								</CardHeader>
								<CardContent className="space-y-3">
									{field.state.value.length === 0 ? (
										<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-10 text-muted-foreground">
											<p className="text-body">Nenhum ingrediente adicionado</p>
											<Button type="button" variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
												<Plus className="size-4 mr-2" />
												Adicionar ingrediente
											</Button>
										</div>
									) : (
										<ItemGroup>
											{field.state.value.map((ingredient: IngredientFormItem, index: number) => (
												<div key={ingredient.ingredient_id || index} className="space-y-2">
													<Item variant="outline">
														<ItemContent>
															<ItemTitle>{ingredient.ingredient_name}</ItemTitle>
														</ItemContent>
														<ItemActions className="gap-2">
															<div className="flex items-center gap-1.5">
																<Input
																	aria-label={`Quantidade líquida de ${ingredient.ingredient_name}`}
																	type="number"
																	step="0.001"
																	value={ingredient.net_quantity ?? 0}
																	onChange={(e) => {
																		const newList = [...field.state.value]
																		newList[index].net_quantity = Number(e.target.value)
																		field.handleChange(newList)
																	}}
																	className="w-24 text-right"
																/>
																<span className="text-caption text-muted-foreground w-8 shrink-0">{ingredient.measure_unit}</span>
															</div>
															<Toggle
																variant="outline"
																size="sm"
																pressed={ingredient.is_optional}
																onPressedChange={(pressed) => {
																	const newList = [...field.state.value]
																	newList[index].is_optional = pressed
																	field.handleChange(newList)
																}}
															>
																{ingredient.is_optional ? <CircleCheck className="size-3.5" /> : <Circle className="size-3.5" />}
																Opcional
															</Toggle>
															<Button
																type="button"
																variant="ghost"
																size="icon-sm"
																className="text-muted-foreground hover:text-destructive"
																aria-label={`Remover ${ingredient.ingredient_name}`}
																onClick={() => {
																	const snapshot = [...field.state.value]
																	const newList = snapshot.filter((_: IngredientFormItem, i: number) => i !== index)
																	field.handleChange(newList)
																	toast("Ingrediente removido.", {
																		action: {
																			label: "Desfazer",
																			onClick: () => field.handleChange(snapshot),
																		},
																	})
																}}
															>
																<Trash2 className="size-3.5" />
															</Button>
														</ItemActions>
													</Item>

													{/* Substituições — insumos que podem substituir este na preparação */}
													<div className="ml-6 space-y-1.5 border-l border-border/60 pl-3">
														{(ingredient.alternatives ?? []).map((alt: AlternativeFormItem, altIndex: number) => (
															<div key={alt.ingredient_id || altIndex} className="flex items-center gap-1.5">
																<Replace className="size-3.5 shrink-0 text-muted-foreground" />
																<span className="flex-1 text-body text-muted-foreground">{alt.ingredient_name}</span>
																<Input
																	aria-label={`Quantidade líquida da substituição ${alt.ingredient_name}`}
																	type="number"
																	step="0.001"
																	value={alt.net_quantity ?? 0}
																	onChange={(e) => {
																		const newList = [...field.state.value]
																		const alts = [...(newList[index].alternatives ?? [])]
																		alts[altIndex] = { ...alts[altIndex], net_quantity: Number(e.target.value) }
																		newList[index].alternatives = alts
																		field.handleChange(newList)
																	}}
																	className="w-24 text-right"
																/>
																<span className="text-caption text-muted-foreground w-8 shrink-0">{alt.measure_unit}</span>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	className="text-muted-foreground hover:text-destructive"
																	aria-label={`Remover substituição ${alt.ingredient_name}`}
																	onClick={() => {
																		const newList = [...field.state.value]
																		newList[index].alternatives = (newList[index].alternatives ?? []).filter(
																			(_: AlternativeFormItem, i: number) => i !== altIndex
																		)
																		field.handleChange(newList)
																	}}
																>
																	<Trash2 className="size-3.5" />
																</Button>
															</div>
														))}
														<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAltTargetIndex(index)}>
															<Replace className="size-3.5 mr-2" />
															Adicionar substituição
														</Button>
													</div>
												</div>
											))}
										</ItemGroup>
									)}
									{field.state.meta.errors && <FieldError errors={field.state.meta.errors.filter(Boolean).map((err) => ({ message: String(err) }))} />}
								</CardContent>
							</Card>
						)}
					</form.Field>

					{/* Modo de preparo — instruções */}
					<Card>
						<CardHeader>
							<CardTitle>Modo de preparo</CardTitle>
						</CardHeader>
						<CardContent>
							<form.Field name="preparation_method">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldContent>
											<Textarea
												id="prep"
												aria-label="Modo de preparo"
												className={cn("min-h-40 bg-background", field.state.meta.errors.length > 0 && "border-destructive")}
												placeholder="Descreva o passo a passo da preparação..."
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
				</form>
			</div>

			{/* Barra de ação do form — sempre acessível, efeito do salvamento explícito */}
			<div className="sticky bottom-0 z-10 -mx-3 border-t border-border bg-background px-3 py-3 sm:-mx-6 sm:px-6">
				<div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-caption text-muted-foreground">{saveCaption}</p>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={handleBack}>
							Cancelar
						</Button>
						<Button type="submit" form="recipe-form" disabled={isPending}>
							{isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
							Salvar Preparação
						</Button>
					</div>
				</div>
			</div>

			{/* Ingredient Selector Modal — adiciona ingrediente principal OU substituição (quando altTargetIndex setado) */}
			{(selectorOpen || altTargetIndex !== null) && (
				<IngredientSelector
					isOpen={selectorOpen || altTargetIndex !== null}
					onClose={() => {
						setSelectorOpen(false)
						setAltTargetIndex(null)
					}}
					onSelect={(ingredient) => {
						if (altTargetIndex !== null) {
							const list = [...form.getFieldValue("ingredients")] as IngredientFormItem[]
							const target = list[altTargetIndex]
							if (target) {
								const alts = target.alternatives ?? []
								// Evita duplicar substituição já existente ou apontar para o próprio ingrediente
								const alreadyExists = ingredient.id === target.ingredient_id || alts.some((a) => a.ingredient_id === ingredient.id)
								if (!alreadyExists) {
									list[altTargetIndex] = {
										...target,
										alternatives: [
											...alts,
											{
												ingredient_id: ingredient.id,
												ingredient_name: ingredient.description ?? "",
												measure_unit: ingredient.measure_unit ?? "UN",
												net_quantity: target.net_quantity ?? 0,
												priority_order: alts.length + 1,
											},
										],
									}
									form.setFieldValue("ingredients", list)
								}
							}
							setAltTargetIndex(null)
							return
						}
						form.pushFieldValue("ingredients", {
							ingredient_id: ingredient.id,
							ingredient_name: ingredient.description ?? "",
							measure_unit: ingredient.measure_unit ?? "UN",
							net_quantity: 0,
							is_optional: false,
							priority_order: form.getFieldValue("ingredients").length + 1,
							alternatives: [],
						})
					}}
				/>
			)}
		</div>
	)
}
