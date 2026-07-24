import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { CalendarCheck, Circle, CircleCheck, Loader2, Pencil, Plus, Save, Trash2, TriangleAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { IngredientSelector } from "@/components/features/shared/IngredientSelector"
import { RecipeFlowEditor } from "@/components/features/shared/recipe-flow/RecipeFlowEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCreateRecipe, useVersionRecipe } from "@/hooks/data/useRecipeMutations"
import { type RecipeNutritionInputIngredient, useRecipeNutrition } from "@/hooks/data/useRecipeNutrition"
import { recipeLastReviewQueryOptions, useRecordRecipeReview } from "@/hooks/data/useRecipes"
import { cn } from "@/lib/cn"
import type { RecipeIngredientSource } from "@/types/domain/recipe-flow"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

// Tabs do formulário — estado persistido na URL (?tab=) para navegação e links compartilháveis.
const RECIPE_FORM_TABS = ["detalhes", "ingredientes", "preparo", "nutricao", "fluxo"] as const
type RecipeFormTab = (typeof RECIPE_FORM_TABS)[number]

// Abas de leitura (campos/texto) mantêm largura confortável e centralizada; a aba "fluxo"
// usa a largura total do container. Centralizar tudo no mesmo eixo evita o "pulo" lateral
// ao alternar entre abas estreitas e a larga — cresce simétrico a partir do centro.
// min-h reserva altura comum: abas curtas/vazias ocupam o mesmo espaço das cheias, sem
// "encolher" o layout ao alternar.
const READING_PANEL = "pt-4 max-w-5xl mx-auto w-full min-h-[32rem]"

// Aba de fluxo — largura total (DAG precisa de espaço horizontal), mesma altura mínima que
// as demais para não haver salto vertical ao alternar de/para as abas de leitura.
const FLOW_PANEL = "pt-4 min-h-[32rem]"

function formatReviewStamp(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

// Schema Validation
const ingredientSchema = z.object({
	ingredient_id: z.string().uuid(),
	ingredient_name: z.string(), // Helper for UI
	measure_unit: z.string(), // Helper for UI
	net_quantity: z.number().min(0.001, "Quantidade deve ser maior que 0"),
	is_optional: z.boolean().default(false),
	priority_order: z.number().default(0),
	// Fatores da ficha técnica (opcionais): vazio/null = herda o insumo e, na ausência, vale 1.
	correction_factor: z.number().positive("FC deve ser maior que 0").nullable().default(null),
	rehydration_index: z.number().positive("IR deve ser maior que 0").nullable().default(null),
})

const recipeSchema = z.object({
	name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
	preparation_method: z.string().default(""),
	portion_yield: z.number().min(1, "Rendimento deve ser pelo menos 1"),
	preparation_time_minutes: z.number().default(0),
	cooking_factor: z.number().min(0.01, "FC mínimo é 0,01").max(20, "FC máximo é 20").default(1.0),
	ingredients: z.array(ingredientSchema).min(1, "Adicione pelo menos um ingrediente"),
})

interface IngredientFormItem {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	net_quantity: number | null
	is_optional: boolean
	priority_order: number
	correction_factor: number | null
	rehydration_index: number | null
}

interface RecipeFormProps {
	initialData?: RecipeWithIngredients | null
	mode: "create" | "edit" | "fork"
}

export function RecipeForm({ initialData, mode }: RecipeFormProps) {
	"use no memo"
	const navigate = useNavigate()
	const { kitchenId } = useParams({ strict: false })

	// Aba ativa via URL — compartilhável e navegável. strict:false porque RecipeForm é
	// usado em várias rotas (criar/editar/fork, global e cozinha) sem declarar este param
	// no validateSearch de cada uma; o valor é validado abaixo (fallback "detalhes").
	const search = useSearch({ strict: false }) as { tab?: string }
	const activeTab: RecipeFormTab = RECIPE_FORM_TABS.includes(search.tab as RecipeFormTab) ? (search.tab as RecipeFormTab) : "detalhes"
	// navigate genérico (componente em várias rotas, sem `from`) não consegue tipar o reducer
	// de search e o resolve como `never`; o cast preserva os demais params e grava ?tab= na URL.
	const setTab = (tab: RecipeFormTab) => navigate({ search: ((prev: Record<string, unknown>) => ({ ...prev, tab })) as never, replace: true })

	const createMutation = useCreateRecipe()
	const versionMutation = useVersionRecipe()

	// Revisão (conferência pelos nutricionistas) — só para preparações persistidas em edição.
	// A UI (e os hooks de revisão) vive em <RecipeReviewActions>, montado só quando há id.
	const reviewRecipeId = mode === "edit" ? (initialData?.id ?? null) : null

	const [selectorOpen, setSelectorOpen] = useState(false)

	// Editor de fluxo opera sobre a versão PERSISTIDA (initialData) — seus insumos têm
	// recipe_ingredient_id, exigidos pelo balanço de materiais. Só habilitado em edição.
	const flowEnabled = mode === "edit" && !!initialData?.id
	const flowIngredients = useMemo<RecipeIngredientSource[]>(
		() =>
			(initialData?.ingredients ?? [])
				.filter((i) => !!i.id)
				.map((i) => ({
					recipeIngredientId: i.id,
					name: i.ingredient?.description ?? "Insumo",
					measureUnit: i.ingredient?.measure_unit ?? "",
					netQuantity: Number(i.net_quantity ?? 0),
					isOptional: i.is_optional ?? false,
				})),
		[initialData?.ingredients]
	)

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
					correction_factor: ing.correction_factor ?? null,
					rehydration_index: ing.rehydration_index ?? null,
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
					correction_factor: i.correction_factor,
					rehydration_index: i.rehydration_index,
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
		<div className="flex min-h-full flex-col space-y-6">
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
			>
				{reviewRecipeId && <RecipeReviewActions recipeId={reviewRecipeId} />}
			</PageHeader>

			{/* Largura total (igual ao PageHeader / container do AppShell). As abas de leitura
			    recebem cap interno via READING_PANEL; a aba de fluxo usa a largura inteira.
			    flex-1 empurra a barra de salvar para o rodapé mesmo com abas curtas. */}
			<div className="flex-1 space-y-8 pb-24">
				<form
					id="recipe-form"
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
				>
					<Tabs value={activeTab} onValueChange={(value) => setTab(value as RecipeFormTab)}>
						{/* grid-cols-5: triggers com largura idêntica — o pill ativo não muda de tamanho ao trocar de aba */}
						<TabsList className="mx-auto grid w-full max-w-2xl grid-cols-5">
							<TabsTrigger value="detalhes">Detalhes</TabsTrigger>
							<TabsTrigger value="ingredientes">
								Ingredientes
								<form.Subscribe selector={(state) => state.values.ingredients.length}>
									{(count) => (count > 0 ? <Badge variant="secondary">{count}</Badge> : null)}
								</form.Subscribe>
							</TabsTrigger>
							<TabsTrigger value="preparo">Modo de preparo</TabsTrigger>
							<TabsTrigger value="nutricao">Nutrição</TabsTrigger>
							<TabsTrigger value="fluxo">Fluxo de produção</TabsTrigger>
						</TabsList>

						{/* Detalhes — rendimento e cocção dimensionam a preparação */}
						<TabsContent value="detalhes" className={READING_PANEL}>
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
														<FieldError errors={field.state.meta.errors.flatMap((err) => (err ? [{ message: String(err) }] : []))} />
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
														Parâmetro avançado: 1,0 = sem perda de massa; acima disso o alimento perde peso ao cozinhar (ex.: frango ≈ 1,33). Faixa usual:
														0,5–2,0.
													</FieldDescription>
													<FieldError errors={field.state.meta.errors.flatMap((err) => (err ? [{ message: String(err) }] : []))} />
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
						</TabsContent>

						{/* Ingredientes — núcleo da preparação */}
						<TabsContent value="ingredientes" className={READING_PANEL}>
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

															{/* Fatores da ficha técnica — opcionais; vazio = 1 (não altera). Peso bruto = peso líquido × FC. */}
															<div className="ml-6 flex flex-wrap items-center gap-x-4 gap-y-2 pl-3 text-caption text-muted-foreground">
																<div className="flex items-center gap-1.5">
																	<span>Fator de correção</span>
																	<Input
																		aria-label={`Fator de correção de ${ingredient.ingredient_name}`}
																		type="number"
																		step="0.01"
																		min={0}
																		placeholder="1"
																		value={ingredient.correction_factor ?? ""}
																		onChange={(e) => {
																			const newList = [...field.state.value]
																			newList[index].correction_factor = e.target.value === "" ? null : Number(e.target.value)
																			field.handleChange(newList)
																		}}
																		className="w-20 text-right"
																	/>
																</div>
																<div className="flex items-center gap-1.5">
																	<span>Índice de reidratação</span>
																	<Input
																		aria-label={`Índice de reidratação de ${ingredient.ingredient_name}`}
																		type="number"
																		step="0.01"
																		min={0}
																		placeholder="1"
																		value={ingredient.rehydration_index ?? ""}
																		onChange={(e) => {
																			const newList = [...field.state.value]
																			newList[index].rehydration_index = e.target.value === "" ? null : Number(e.target.value)
																			field.handleChange(newList)
																		}}
																		className="w-20 text-right"
																	/>
																</div>
																{(ingredient.net_quantity ?? 0) > 0 && (ingredient.correction_factor ?? 0) > 0 && (
																	<span className="text-foreground">
																		Peso bruto:{" "}
																		<strong className="font-medium">
																			{((ingredient.net_quantity ?? 0) * (ingredient.correction_factor ?? 1)).toLocaleString("pt-BR", {
																				maximumFractionDigits: 2,
																			})}
																		</strong>{" "}
																		{ingredient.measure_unit}
																	</span>
																)}
															</div>
														</div>
													))}
												</ItemGroup>
											)}
											{field.state.meta.errors && <FieldError errors={field.state.meta.errors.flatMap((err) => (err ? [{ message: String(err) }] : []))} />}
										</CardContent>
									</Card>
								)}
							</form.Field>
						</TabsContent>

						{/* Modo de preparo — texto livre */}
						<TabsContent value="preparo" className={READING_PANEL}>
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
													<FieldError errors={field.state.meta.errors.flatMap((err) => (err ? [{ message: String(err) }] : []))} />
												</FieldContent>
											</Field>
										)}
									</form.Field>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Nutrição — tabela por 100 g, calculada dos insumos + quantidades (peso líquido) */}
						<TabsContent value="nutricao" className={READING_PANEL}>
							<form.Subscribe selector={(state) => state.values.ingredients}>
								{(ingredients) => <RecipeNutritionPanel ingredients={ingredients as IngredientFormItem[]} />}
							</form.Subscribe>
						</TabsContent>

						{/* Fluxo de produção — DAG estruturado, salvo separadamente da preparação */}
						<TabsContent value="fluxo" className={FLOW_PANEL}>
							<Card>
								<CardHeader>
									<CardTitle>Fluxo de produção</CardTitle>
								</CardHeader>
								<CardContent>
									{flowEnabled && initialData ? (
										<>
											<p className="text-caption text-muted-foreground pb-3">
												O fluxo é salvo separadamente (botão "Salvar fluxo") na versão atual. Ao salvar a preparação, ele é copiado para a nova versão.
											</p>
											<RecipeFlowEditor recipeId={initialData.id} kitchenId={initialData.kitchen_id ?? null} ingredients={flowIngredients} />
										</>
									) : (
										<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border py-10 text-center text-muted-foreground">
											<p className="text-body">O fluxo de produção fica disponível após salvar a preparação.</p>
											<p className="text-caption">Salve a preparação e abra-a em edição para montar o fluxo.</p>
										</div>
									)}
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</form>
			</div>

			{/* Barra de ação do form — sempre acessível, efeito do salvamento explícito */}
			<div className="sticky bottom-0 z-10 -mx-3 border-t border-border bg-background px-3 py-3 sm:-mx-6 sm:px-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

			{/* Ingredient Selector Modal — adiciona ingrediente principal à preparação */}
			{selectorOpen && (
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
							// Prefill dos fatores com o padrão do insumo (editável por preparação; vazio = 1).
							correction_factor: ingredient.correction_factor ?? null,
							rehydration_index: ingredient.rehydration_index ?? null,
						})
					}}
				/>
			)}
		</div>
	)
}

/**
 * Ações de revisão (conferência) no header da preparação em edição. Montado apenas
 * quando há `recipeId` persistido, então os hooks de revisão sempre recebem um id válido
 * (sem chave de cache vazia nem query desabilitada).
 */
function RecipeReviewActions({ recipeId }: { recipeId: string }) {
	const { recordRecipeReview, isReviewing } = useRecordRecipeReview()
	const { data: lastReview } = useQuery(recipeLastReviewQueryOptions(recipeId))

	const handleReview = async () => {
		try {
			await recordRecipeReview(recipeId)
			toast.success("Revisão registrada")
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(msg || "Erro ao registrar revisão")
		}
	}

	return (
		<div className="flex items-center gap-3">
			<span className="hidden items-center gap-1.5 text-caption text-muted-foreground sm:flex">
				<CalendarCheck className="size-4 shrink-0" />
				{lastReview ? (
					<span>
						Revisada em <strong className="font-medium text-foreground">{formatReviewStamp(lastReview.reviewed_at)}</strong>
						{lastReview.reviewed_by_name ? ` por ${lastReview.reviewed_by_name}` : ""}
					</span>
				) : (
					<span>Ainda não revisada</span>
				)}
			</span>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button type="button" variant="outline" size="sm" onClick={handleReview} disabled={isReviewing} className="gap-1.5">
							{isReviewing ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
							Revisado
						</Button>
					}
				/>
				<TooltipContent>Registrar conferência desta preparação (revisão pelos nutricionistas)</TooltipContent>
			</Tooltip>
		</div>
	)
}

/** Separa a unidade embutida no nome do nutriente ("Carboidratos (g)" → label + "g"). */
function parseNutrientName(name: string): { label: string; unit: string | null } {
	const match = name.match(/\s*\(([^)]+)\)\s*$/)
	if (match && match.index != null) return { label: name.slice(0, match.index).trim(), unit: match[1] }
	return { label: name, unit: null }
}

function formatNutrientNumber(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 2 : 1 })
}

/**
 * Tabela nutricional automática da preparação — POR 100 g do preparo.
 *
 * Calculada dos insumos (peso líquido) via `useRecipeNutrition`; reativa às edições de
 * ingredientes/quantidades no formulário. Não persiste — é derivada. Os fatores de
 * correção/cocção/reidratação NÃO entram (dimensionam peso bruto/compras, não a composição).
 */
function RecipeNutritionPanel({ ingredients }: { ingredients: IngredientFormItem[] }) {
	const input = useMemo<RecipeNutritionInputIngredient[]>(
		() =>
			ingredients.map((i) => ({
				ingredientId: i.ingredient_id,
				ingredientName: i.ingredient_name,
				netQuantity: i.net_quantity,
				measureUnit: i.measure_unit,
				isOptional: i.is_optional,
			})),
		[ingredients]
	)
	const { isLoading, rows, coverage, massWithDataG } = useRecipeNutrition(input)

	const hasActiveIngredients = coverage.totalIngredients > 0

	return (
		<Card>
			<CardHeader>
				<CardTitle>Tabela nutricional (por 100 g)</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{!hasActiveIngredients ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border py-10 text-center text-muted-foreground">
						<p className="text-body">Adicione ingredientes com quantidade para calcular a tabela nutricional.</p>
						<p className="text-caption">Ingredientes opcionais não entram no cálculo da preparação base.</p>
					</div>
				) : isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				) : rows.length === 0 ? (
					<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-4 text-body text-muted-foreground">
						<TriangleAlert className="size-4 shrink-0 translate-y-0.5" />
						<p>Nenhum dos ingredientes tem composição nutricional cadastrada. Vincule uma tabela alimentar ou informe os nutrientes nos insumos.</p>
					</div>
				) : (
					<>
						<div className="overflow-hidden rounded-lg">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b-2 border-foreground/80 bg-muted/40">
										<th className="px-4 py-2 text-left font-semibold text-foreground">Nutrientes</th>
										<th className="w-44 px-4 py-2 text-right font-semibold text-foreground">Quantidade por 100 g</th>
										<th className="w-24 px-4 py-2 text-right font-semibold text-foreground">%VD*</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{rows.map((row) => {
										const { label, unit } = parseNutrientName(row.name)
										const vd = row.dailyValue && row.dailyValue > 0 ? (row.per100g / row.dailyValue) * 100 : null
										const vdLabel = vd != null ? `${vd < 1 && vd > 0 ? vd.toFixed(1) : Math.round(vd)}%` : "—"
										return (
											<tr key={row.nutrientId} className={cn("transition-colors hover:bg-muted/30", row.isEnergy && "bg-muted/20")}>
												<td className={cn("px-4 py-1.5 text-foreground", row.isEnergy && "font-semibold")}>{label}</td>
												<td className="px-4 py-1.5 text-right font-mono tabular-nums text-foreground">
													{formatNutrientNumber(row.per100g)}
													{unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
												</td>
												<td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{vdLabel}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>

						<p className="text-caption text-muted-foreground">
							* %VD com base em uma dieta de 2.000 kcal. Calculado sobre o peso líquido dos insumos (a parte comestível); os fatores de correção, cocção e
							reidratação não alteram a composição.
						</p>

						{coverage.missing.length > 0 && (
							<div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-caption text-foreground">
								<TriangleAlert className="size-4 shrink-0 translate-y-0.5 text-warning" />
								<div>
									<p className="font-medium">
										{coverage.withData} de {coverage.totalIngredients} ingredientes com composição conhecida.
									</p>
									<p className="text-muted-foreground">
										Sem dados nutricionais (não contabilizados): {coverage.missing.join(", ")}. A tabela reflete apenas os{" "}
										{massWithDataG.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g caracterizados.
									</p>
								</div>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}
