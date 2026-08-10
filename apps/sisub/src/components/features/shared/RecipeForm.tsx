import type { EditScope } from "@iefa/sisub-domain"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { CalendarCheck, Circle, CircleCheck, GitFork, Loader2, Pencil, Plus, Save, Trash2, TriangleAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { IngredientSelector } from "@/components/features/shared/IngredientSelector"
import { RecipeFlowEditor } from "@/components/features/shared/recipe-flow/RecipeFlowEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"
import { useCreateRecipe, useSaveRecipeEdit } from "@/hooks/data/useRecipeMutations"
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

/** Sentinela do item "sem pasta" — o Select não representa `null` como valor de item. */
const NO_FOLDER_VALUE = "__none__"

// Aba de fluxo — largura total (DAG precisa de espaço horizontal), mesma altura mínima que
// as demais para não haver salto vertical ao alternar de/para as abas de leitura.
const FLOW_PANEL = "pt-4 min-h-[32rem]"

function formatReviewStamp(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

// Schema Validation
// Este schema é o validator do form (não só um check no submit), então o tipo de ENTRADA
// dele tem que ser exatamente o dos valores do formulário: nada de `.default()` (o input
// viraria `T | undefined`) e `ingredient_id`/`net_quantity` aceitam null, que é como a
// linha existe na tela — item recém-adicionado nasce sem quantidade. O null é rejeitado
// no refine, com a mensagem que o usuário lê.
const ingredientSchema = z.object({
	ingredient_id: z
		.string()
		.uuid("Insumo inválido")
		.nullable()
		.refine((value) => value !== null, "Selecione um insumo"),
	ingredient_name: z.string(), // Helper for UI
	measure_unit: z.string(), // Helper for UI
	net_quantity: z
		.number()
		.nullable()
		.refine((value) => value != null && value >= 0.001, "Quantidade deve ser maior que 0"),
	is_optional: z.boolean(),
	priority_order: z.number(),
	// Fatores da ficha técnica (opcionais): vazio/null = herda o insumo e, na ausência, vale 1.
	correction_factor: z.number().positive("FC deve ser maior que 0").nullable(),
	rehydration_index: z.number().positive("IR deve ser maior que 0").nullable(),
})

const recipeSchema = z.object({
	name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
	preparation_method: z.string(),
	portion_yield: z.number().min(1, "Rendimento deve ser pelo menos 1"),
	preparation_time_minutes: z.number(),
	cooking_factor: z.number().min(0.01, "FC mínimo é 0,01").max(20, "FC máximo é 20"),
	/** Pasta de organização — opcional por definição: agrupar é conveniência, não requisito. */
	folder_id: z.string().uuid().nullable(),
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

// ── Validação: um schema, três superfícies ──────────────────────────────────
// `recipeSchema` é o gate do submit (validators.onChange), a origem do realce em
// vermelho e o texto do toast de erro. Derivar as três do mesmo lugar evita a
// divergência clássica — a regra muda e a mensagem continua dizendo outra coisa.
// Os problemas são recalculados a partir dos valores porque os itens de ingrediente
// não têm <form.Field> próprio: não existe `meta.errors` por linha para ler.

const TAB_LABEL: Record<RecipeFormTab, string> = {
	detalhes: "Detalhes",
	ingredientes: "Ingredientes",
	preparo: "Modo de preparo",
	nutricao: "Nutrição",
	fluxo: "Fluxo de produção",
}

/** Campo de topo do schema → aba que o contém + rótulo exibido ao usuário. */
const FIELD_LOCATION: Record<string, { tab: RecipeFormTab; label: string }> = {
	name: { tab: "detalhes", label: "Nome da preparação" },
	portion_yield: { tab: "detalhes", label: "Rendimento" },
	preparation_time_minutes: { tab: "detalhes", label: "Tempo de preparo" },
	cooking_factor: { tab: "detalhes", label: "Fator de cocção" },
	folder_id: { tab: "detalhes", label: "Pasta" },
	preparation_method: { tab: "preparo", label: "Modo de preparo" },
	ingredients: { tab: "ingredientes", label: "Ingredientes" },
}

/** Campo do ingrediente → rótulo curto; compõe o "{insumo} — {campo}" do toast. */
const INGREDIENT_FIELD_LABEL: Record<string, string> = {
	ingredient_id: "insumo",
	net_quantity: "quantidade",
	correction_factor: "fator de correção",
	rehydration_index: "índice de reidratação",
}

interface FormProblem {
	tab: RecipeFormTab
	label: string
	message: string
}

type TabProblemCount = Record<RecipeFormTab, number>

/** Rótulo de um problema de ingrediente: "{insumo} — {campo}". */
function ingredientProblemLabel(ingredients: IngredientFormItem[], index: number, leaf: PropertyKey | undefined): string {
	const name = ingredients[index]?.ingredient_name || `Ingrediente ${index + 1}`
	if (typeof leaf !== "string") return name
	return `${name} — ${INGREDIENT_FIELD_LABEL[leaf] ?? leaf}`
}

/**
 * Tudo que impede o salvamento, já localizado (aba + rótulo do campo). Um problema por
 * CAMPO: dois issues no mesmo campo viram um só, senão a contagem da aba e a do toast
 * ("3 campos impedem…") diriam mais campos do que os que estão marcados na tela.
 */
function collectProblems(values: unknown): FormProblem[] {
	const parsed = recipeSchema.safeParse(values)
	if (parsed.success) return []
	const ingredients = (values as { ingredients?: IngredientFormItem[] }).ingredients ?? []
	const byField = new Map<string, FormProblem>()
	for (const issue of parsed.error.issues) {
		const [head, index, leaf] = issue.path
		const problem: FormProblem =
			head === "ingredients" && typeof index === "number"
				? { tab: "ingredientes", label: ingredientProblemLabel(ingredients, index, leaf), message: issue.message }
				: {
						tab: FIELD_LOCATION[String(head)]?.tab ?? "detalhes",
						label: FIELD_LOCATION[String(head)]?.label ?? String(head),
						message: issue.message,
					}
		const key = issue.path.map(String).join(".")
		if (!byField.has(key)) byField.set(key, problem)
	}
	return [...byField.values()]
}

function emptyTabProblemCount(): TabProblemCount {
	return { detalhes: 0, ingredientes: 0, preparo: 0, nutricao: 0, fluxo: 0 }
}

/**
 * Contagem de erros por aba, codificada em string.
 *
 * `form.Subscribe` compara o resultado do seletor por REFERÊNCIA (`===`, não shallow):
 * devolver um objeto re-renderizaria a barra de abas a cada tecla digitada. A string só
 * muda quando a contagem muda. E antes da primeira tentativa de salvar nem roda o schema
 * — não há nada para mostrar, então não se paga um `safeParse` da ficha inteira por tecla.
 */
function encodeTabProblems(state: { values: unknown; submissionAttempts: number }): string {
	if (state.submissionAttempts === 0) return ""
	const counts = countProblemsByTab(collectProblems(state.values))
	return RECIPE_FORM_TABS.map((tab) => counts[tab]).join(",")
}

function decodeTabProblems(encoded: string): TabProblemCount {
	const counts = emptyTabProblemCount()
	if (!encoded) return counts
	const parts = encoded.split(",")
	RECIPE_FORM_TABS.forEach((tab, index) => {
		counts[tab] = Number(parts[index]) || 0
	})
	return counts
}

function countProblemsByTab(problems: FormProblem[]): TabProblemCount {
	const counts = emptyTabProblemCount()
	for (const problem of problems) counts[problem.tab] += 1
	return counts
}

/** Erros de UM ingrediente, por campo — realce da linha na aba Ingredientes. */
function ingredientErrors(item: IngredientFormItem): Partial<Record<keyof IngredientFormItem, string>> {
	const parsed = ingredientSchema.safeParse(item)
	if (parsed.success) return {}
	const errors: Partial<Record<keyof IngredientFormItem, string>> = {}
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof IngredientFormItem | undefined
		if (key && !errors[key]) errors[key] = issue.message
	}
	return errors
}

/** Erros do TanStack Form (issues do schema, ou strings) no formato do <FieldError>. */
function toFieldErrors(errors: readonly unknown[]): Array<{ message?: string }> {
	return errors.map((error) => ({ message: typeof error === "string" ? error : (error as { message?: string } | undefined)?.message }))
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
	const saveEditMutation = useSaveRecipeEdit()

	// Pastas: agrupamento simples da listagem (não hierárquico, sem efeito na ficha técnica).
	const { folders: recipeFolders, nameById: folderNameById } = useRecipeFolders()

	// Contexto da edição = a ROTA em que o formulário está montado, não o `kitchen_id` do
	// dado carregado. Editar uma preparação global pela tela de uma cozinha forka; pela
	// tela global, versiona o global. Derivar do dado fazia a edição na cozinha alterar o
	// catálogo global (válido para toda a FAB).
	const editContext: EditScope = kitchenId ? { scope: "kitchen", kitchenId: Number(kitchenId) } : { scope: "global" }

	// Preparação global aberta no contexto de uma cozinha: salvar vai criar cópia local.
	const willFork = mode !== "create" && !!initialData && initialData.kitchen_id == null && editContext.scope === "kitchen"

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
			folder_id: initialData?.folder_id ?? null,
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
		// Gate do salvamento. Com o schema aqui, `field.state.meta.errors` passa a ser
		// preenchido e os realces em vermelho (que já existiam no JSX) acendem sozinhos;
		// no submit o TanStack roda os validadores onChange antes de chamar onSubmit.
		validators: {
			onChange: recipeSchema,
		},
		// Submit barrado: leva o usuário à primeira aba com problema e diz QUAIS campos
		// estão errados. O aviso anterior ("Preencha todos os campos obrigatórios") não
		// dizia qual campo nem em qual das 5 abas ele estava — com o formulário abaixo da
		// dobra e o erro em outra aba, não havia como achar.
		onSubmitInvalid: ({ value }) => {
			const problems = collectProblems(value)
			if (problems.length === 0) return
			const first = problems[0]
			if (first) setTab(first.tab)
			const shown = problems.slice(0, 4)
			const rest = problems.length - shown.length
			toast.error(problems.length === 1 ? "1 campo impede o salvamento" : `${problems.length} campos impedem o salvamento`, {
				// id fixo: clicar em salvar de novo atualiza o mesmo toast em vez de empilhar
				// uma torre de avisos idênticos.
				id: "recipe-form-invalid",
				description: (
					<ul className="mt-1 list-disc space-y-0.5 pl-4">
						{shown.map((problem) => (
							<li key={`${problem.label}:${problem.message}`}>
								<span className="font-medium">{problem.label}</span> ({TAB_LABEL[problem.tab]}): {problem.message}
							</li>
						))}
						{rest > 0 && <li>e mais {rest}…</li>}
					</ul>
				),
			})
		},
		onSubmit: async ({ value }) => {
			"use no memo"
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

			const { ingredients: _ingredients, ...recipeData } = value

			if (mode === "create") {
				await createMutation.mutateAsync({
					...recipeData,
					kitchen_id: editContext.scope === "kitchen" ? editContext.kitchenId : null,
					ingredients: mappedIngredients,
				})
			} else if (initialData) {
				// "edit" e "fork" convergem: o servidor decide versionar ou forkar a partir do
				// dono da base e do contexto. A versão e o escopo não vêm mais do cliente.
				await saveEditMutation.mutateAsync({
					baseRecipeId: initialData.id,
					context: editContext,
					data: { ...recipeData, ingredients: mappedIngredients },
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

	const isPending = createMutation.isPending || saveEditMutation.isPending

	// Contexto do modo — distinto do nome (editado no título da página)
	const modeBadge =
		mode === "edit" && initialData?.version != null ? (
			<Badge variant="outline">v{initialData.version}</Badge>
		) : mode === "fork" ? (
			<Badge variant="secondary">Personalização</Badge>
		) : undefined

	const saveCaption =
		mode === "create"
			? "Salvar cria a preparação."
			: willFork
				? "Salvar cria uma cópia local desta cozinha. A preparação global não é alterada."
				: "Salvar gera automaticamente uma nova versão desta preparação."

	return (
		<div className="flex min-h-full flex-col space-y-6">
			<PageHeader
				title={
					<form.Field name="name">
						{(field) => {
							// O nome mora no título (fora das abas), então o erro dele é mostrado aqui
							// mesmo — inline, para caber dentro do <h1> do PageHeader.
							const invalid = field.state.meta.errors.length > 0
							const nameError = toFieldErrors(field.state.meta.errors)[0]?.message
							return (
								<span className="group/title inline-flex max-w-full items-center gap-1.5">
									<input
										aria-label="Nome da preparação"
										aria-invalid={invalid}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Nome da preparação"
										className={cn(
											"text-heading leading-tight text-foreground bg-transparent",
											"field-sizing-content min-w-[10ch] max-w-full",
											"-mx-2 rounded-md px-2 py-0.5",
											"outline-none transition-colors hover:bg-muted/60 focus:bg-muted/60",
											"focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60",
											"aria-invalid:bg-destructive/5 aria-invalid:ring-[3px] aria-invalid:ring-destructive/40"
										)}
									/>
									{nameError ? (
										<span role="alert" className="text-caption font-normal text-destructive">
											{nameError}
										</span>
									) : (
										<Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100" />
									)}
								</span>
							)
						}}
					</form.Field>
				}
				badge={modeBadge}
				onBack={handleBack}
			>
				{reviewRecipeId && <RecipeReviewActions recipeId={reviewRecipeId} />}
			</PageHeader>

			{willFork && (
				<Alert>
					<GitFork className="size-4" />
					<AlertTitle>Preparação global</AlertTitle>
					<AlertDescription>
						Esta preparação é do catálogo global da SDAB. Ao salvar, uma cópia local desta cozinha é criada com as suas alterações — a preparação global
						permanece intacta e as demais unidades continuam vendo a versão original.
					</AlertDescription>
				</Alert>
			)}

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
						{/* grid-cols-5: triggers com largura idêntica — o pill ativo não muda de tamanho ao trocar de aba.
						    Cada trigger carrega a contagem de erros da sua aba: com o campo errado em outra aba,
						    a barra é o único lugar onde o usuário enxerga que existe pendência. */}
						<form.Subscribe selector={encodeTabProblems}>
							{(encoded) => {
								const counts = decodeTabProblems(encoded)
								return (
									<TabsList className="mx-auto grid w-full max-w-2xl grid-cols-5">
										{RECIPE_FORM_TABS.map((tab) => {
											const errorCount = counts[tab]
											// O par com `data-active` é necessário: a aba selecionada força `text-foreground`
											// com a mesma especificidade, e sem o seletor duplo o vermelho sumiria justo na
											// aba que o usuário está olhando.
											return (
												<TabsTrigger
													key={tab}
													value={tab}
													data-invalid={errorCount > 0 || undefined}
													className="data-[invalid]:text-destructive data-[invalid]:data-active:text-destructive"
												>
													{TAB_LABEL[tab]}
													{errorCount > 0 ? (
														<Badge variant="destructive">
															{errorCount}
															<span className="sr-only">{errorCount === 1 ? " campo com erro" : " campos com erro"}</span>
														</Badge>
													) : tab === "ingredientes" ? (
														<form.Subscribe selector={(state) => state.values.ingredients.length}>
															{(count) => (count > 0 ? <Badge variant="secondary">{count}</Badge> : null)}
														</form.Subscribe>
													) : null}
												</TabsTrigger>
											)
										})}
									</TabsList>
								)
							}}
						</form.Subscribe>

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
															aria-invalid={field.state.meta.errors.length > 0}
															onChange={(e) => field.handleChange(Number(e.target.value))}
														/>
														<FieldDescription>Base para custo e escala das quantidades.</FieldDescription>
														<FieldError errors={toFieldErrors(field.state.meta.errors)} />
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
													<FieldError errors={toFieldErrors(field.state.meta.errors)} />
												</FieldContent>
												<Input
													id="cooking_factor"
													type="number"
													step="0.01"
													placeholder="1,0"
													value={field.state.value || 1}
													aria-invalid={field.state.meta.errors.length > 0}
													className="w-28 shrink-0"
													onChange={(e) => field.handleChange(Number(e.target.value))}
												/>
											</Field>
										)}
									</form.Field>
								</CardContent>
							</Card>

							{/* Organização — pasta é só agrupamento: não entra na ficha nem gera versão por si só */}
							<Card className="mt-6">
								<CardHeader>
									<CardTitle>Organização</CardTitle>
								</CardHeader>
								<CardContent>
									<form.Field name="folder_id">
										{(field) => (
											<Field orientation="horizontal">
												<FieldContent>
													<FieldLabel htmlFor="folder_id">Pasta</FieldLabel>
													<FieldDescription>Agrupamento para organizar e filtrar a listagem de preparações.</FieldDescription>
												</FieldContent>
												<Select
													value={field.state.value ?? NO_FOLDER_VALUE}
													onValueChange={(value) => field.handleChange(value === NO_FOLDER_VALUE ? null : (value as string))}
												>
													<SelectTrigger id="folder_id" className="min-w-48">
														<SelectValue>{field.state.value ? (folderNameById.get(field.state.value) ?? "Pasta") : "Sem pasta"}</SelectValue>
													</SelectTrigger>
													<SelectContent>
														<SelectItem value={NO_FOLDER_VALUE}>Sem pasta</SelectItem>
														{recipeFolders.map((folder) => (
															<SelectItem key={folder.id} value={folder.id}>
																{folder.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
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
													{field.state.value.map((ingredient: IngredientFormItem, index: number) => {
														// Cada linha valida contra o mesmo `ingredientSchema` do submit. Sem isso o
														// caso mais comum — insumo adicionado entra com quantidade 0 — só aparecia
														// como um toast genérico depois de tentar salvar.
														const rowErrors = ingredientErrors(ingredient)
														const rowMessages = [
															rowErrors.ingredient_id,
															rowErrors.net_quantity,
															rowErrors.correction_factor,
															rowErrors.rehydration_index,
														].filter(Boolean)
														return (
															<div key={ingredient.ingredient_id || index} className="space-y-2">
																<Item variant="outline" data-invalid={rowMessages.length > 0 || undefined} className="data-[invalid]:border-destructive/60">
																	<ItemContent>
																		<ItemTitle>{ingredient.ingredient_name}</ItemTitle>
																	</ItemContent>
																	<ItemActions className="gap-2">
																		<div className="flex items-center gap-1.5">
																			<Input
																				aria-label={`Quantidade líquida de ${ingredient.ingredient_name}`}
																				type="number"
																				step="0.001"
																				aria-invalid={!!rowErrors.net_quantity}
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
																			aria-invalid={!!rowErrors.correction_factor}
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
																			aria-invalid={!!rowErrors.rehydration_index}
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

																{rowMessages.length > 0 && (
																	<p role="alert" className="ml-6 pl-3 text-caption text-destructive">
																		{rowMessages.join(" · ")}
																	</p>
																)}
															</div>
														)
													})}
												</ItemGroup>
											)}
											<FieldError errors={toFieldErrors(field.state.meta.errors)} />
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
													<FieldError errors={toFieldErrors(field.state.meta.errors)} />
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
