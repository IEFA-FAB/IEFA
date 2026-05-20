import type { Recipe } from "@iefa/database/sisub"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { CheckCircle2, Circle, GitFork, Loader2, Plus, Save, Users, X } from "lucide-react"
import { useEffect, useReducer } from "react"
import { requirePermission } from "@/auth/pbac"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useTemplate, useUpdateTemplate } from "@/hooks/data/useTemplates"
import { cn } from "@/lib/cn"
import type { TemplateItemDraft } from "@/types/domain/planning"

const WEEKDAYS = [
	{ num: 1, label: "Segunda-feira", abbr: "Seg" },
	{ num: 2, label: "Terça-feira", abbr: "Ter" },
	{ num: 3, label: "Quarta-feira", abbr: "Qua" },
	{ num: 4, label: "Quinta-feira", abbr: "Qui" },
	{ num: 5, label: "Sexta-feira", abbr: "Sex" },
	{ num: 6, label: "Sábado", abbr: "Sáb" },
	{ num: 7, label: "Domingo", abbr: "Dom" },
]

/**
 * KITCHEN — Editor de Cardápio Semanal
 * URL: /kitchen/:kitchenId/weekly-menus/:weeklyMenuId
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/weekly-menus/$weeklyMenuId")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: WeeklyMenuEditorPage,
	head: () => ({
		meta: [{ title: "Editar Cardápio Semanal - SISUB" }],
	}),
})

// ─── Sub-components ──────────────────────────────────────────────────────────

type MealType = { id: string; name: string | null }
type RecipeWithHeadcount = Recipe & { headcountOverride: number | null }

function DayOverviewCard({
	day,
	mealTypes,
	items,
	recipeMap,
	onNavigate,
}: {
	day: (typeof WEEKDAYS)[number]
	mealTypes: MealType[]
	items: TemplateItemDraft[]
	recipeMap: Map<string, string>
	onNavigate: () => void
}) {
	const dayItems = items.filter((i) => i.day_of_week === day.num)
	const totalRecipes = dayItems.length
	const filledCount = mealTypes.filter((mt) => dayItems.some((i) => i.meal_type_id === mt.id)).length
	const allFilled = mealTypes.length > 0 && filledCount === mealTypes.length

	return (
		<Button
			type="button"
			variant="card"
			onClick={onNavigate}
			className={cn("text-left w-full h-auto p-4 flex-col items-start justify-start", allFilled && "border-success/40 h-full")}
		>
			<div className="flex items-center justify-between mb-3">
				<span className="text-sm text-subheading">{day.abbr}</span>
				<Badge variant={totalRecipes > 0 ? "default" : "outline"} className="text-xs tabular-nums">
					{totalRecipes}
				</Badge>
			</div>

			<div className="space-y-1.5">
				{mealTypes.length === 0 && <p className="text-xs text-muted-foreground/50 italic">sem refeições</p>}
				{mealTypes.map((mt) => {
					const mtItems = dayItems.filter((i) => i.meal_type_id === mt.id)
					const count = mtItems.length
					const entries = mtItems.map((i) => ({ id: i.recipe_id, name: recipeMap.get(i.recipe_id) }))
					return (
						<div key={mt.id} className="flex items-center gap-2">
							{count > 0 ? <CheckCircle2 className="size-3.5 text-success shrink-0" /> : <Circle className="size-3.5 text-muted-foreground/30 shrink-0" />}
							<span className={cn("text-xs truncate flex-1", count > 0 ? "text-foreground" : "text-muted-foreground/50")}>{mt.name}</span>
							{count > 0 && (
								<Tooltip>
									<TooltipTrigger
										className="text-xs text-muted-foreground shrink-0 tabular-nums underline decoration-dotted cursor-default"
										onClick={(e) => e.stopPropagation()}
									>
										×{count}
									</TooltipTrigger>
									<TooltipContent side="left" className="max-w-[220px]">
										<ul className="space-y-1">
											{entries.map(({ id, name }) =>
												name === undefined ? (
													<li key={id} className="flex items-center">
														<Loader2 className="size-3 animate-spin" />
													</li>
												) : (
													<li key={id} className="text-xs">
														{name}
													</li>
												)
											)}
										</ul>
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					)
				})}
			</div>

			<p className="mt-3 text-xs text-muted-foreground/50 text-right">
				{filledCount}/{mealTypes.length} refeições
			</p>
		</Button>
	)
}

function DayMealSection({
	mealType,
	recipes,
	onOpenSelector,
	onRemoveRecipe,
	onItemHeadcountChange,
}: {
	mealType: MealType
	recipes: RecipeWithHeadcount[]
	onOpenSelector: () => void
	onRemoveRecipe: (recipeId: string) => void
	/** Atualiza o headcount de uma preparação específica. */
	onItemHeadcountChange: (recipeId: string, value: number | null) => void
}) {
	const hasRecipes = recipes.length > 0

	return (
		<Card className="overflow-hidden p-0 gap-0">
			<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
				<div className="flex items-center gap-2">
					<span className="text-subheading">{mealType.name}</span>
					{hasRecipes && (
						<Badge variant="secondary" className="text-xs">
							{recipes.length}
						</Badge>
					)}
				</div>

				<Button type="button" size="sm" variant="ghost" onClick={onOpenSelector} className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground">
					<Plus className="size-3.5" />
					Adicionar
				</Button>
			</div>

			{hasRecipes ? (
				<div className="p-3 space-y-1.5">
					{recipes.map((recipe) => (
						<div key={recipe.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 group hover:bg-muted/60 transition-colors">
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">{recipe.name}</p>
								{recipe.rational_id && <p className="text-xs text-muted-foreground font-mono">{recipe.rational_id}</p>}
							</div>

							{/* Comensais por preparação */}
							<Tooltip>
								<TooltipTrigger className="flex items-center gap-1 shrink-0 cursor-default" onClick={(e) => e.stopPropagation()}>
									<Users className="size-3 text-muted-foreground" />
									<Input
										type="number"
										min="1"
										className="h-6 w-16 text-xs"
										value={recipe.headcountOverride ?? ""}
										placeholder="pax"
										onChange={(e) => onItemHeadcountChange(recipe.id, e.target.value ? parseInt(e.target.value, 10) : null)}
										onClick={(e) => e.stopPropagation()}
									/>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p className="text-caption text-foreground">Comensais desta preparação</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{recipe.headcountOverride ? `${recipe.headcountOverride} pessoas previstas` : "Informe o nº de comensais"}
									</p>
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
											onClick={() => onRemoveRecipe(recipe.id)}
										>
											<X className="size-3.5" />
										</Button>
									}
								></TooltipTrigger>
								<TooltipContent>Remover</TooltipContent>
							</Tooltip>
						</div>
					))}
				</div>
			) : (
				<div className="px-4 py-6 text-center">
					<p className="text-xs text-muted-foreground mb-2">Nenhuma receita atribuída</p>
					<Button type="button" size="sm" variant="outline" onClick={onOpenSelector} className="text-xs">
						<Plus className="size-3.5 mr-1" />
						Adicionar Preparações
					</Button>
				</div>
			)}
		</Card>
	)
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type WeeklyMenuEditorState = {
	name: string
	description: string
	items: TemplateItemDraft[]
	initialized: boolean
	activeTab: string
	selectorOpen: boolean
	selectedCell: { dayOfWeek: number; mealTypeId: string } | null
}

type WeeklyMenuEditorAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_DESCRIPTION"; value: string }
	| { type: "SET_ITEMS"; value: TemplateItemDraft[] }
	| { type: "SET_INITIALIZED" }
	| { type: "SET_ACTIVE_TAB"; value: string }
	| { type: "SET_SELECTOR_OPEN"; value: boolean }
	| { type: "SET_SELECTED_CELL"; value: { dayOfWeek: number; mealTypeId: string } | null }

const initialWeeklyMenuEditorState: WeeklyMenuEditorState = {
	name: "",
	description: "",
	items: [],
	initialized: false,
	activeTab: "overview",
	selectorOpen: false,
	selectedCell: null,
}

function weeklyMenuEditorReducer(state: WeeklyMenuEditorState, action: WeeklyMenuEditorAction): WeeklyMenuEditorState {
	switch (action.type) {
		case "SET_NAME":
			return { ...state, name: action.value }
		case "SET_DESCRIPTION":
			return { ...state, description: action.value }
		case "SET_ITEMS":
			return { ...state, items: action.value }
		case "SET_INITIALIZED":
			return { ...state, initialized: true }
		case "SET_ACTIVE_TAB":
			return { ...state, activeTab: action.value }
		case "SET_SELECTOR_OPEN":
			return { ...state, selectorOpen: action.value }
		case "SET_SELECTED_CELL":
			return { ...state, selectedCell: action.value }
		default:
			return state
	}
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function WeeklyMenuEditorPage() {
	const { kitchenId: kitchenIdStr, weeklyMenuId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(weeklyMenuId as string)
	const { data: mealTypes } = useMealTypes(kitchenId)
	const { data: allRecipes } = useRecipes()
	const { mutate: updateTemplate, isPending: isSaving } = useUpdateTemplate()

	const [editorState, dispatch] = useReducer(weeklyMenuEditorReducer, initialWeeklyMenuEditorState)
	const { name, description, items, initialized, activeTab, selectorOpen, selectedCell } = editorState

	useEffect(() => {
		if (!template || initialized) return
		dispatch({ type: "SET_NAME", value: template.name ?? "" })
		dispatch({ type: "SET_DESCRIPTION", value: template.description ?? "" })
		dispatch({
			type: "SET_ITEMS",
			value: template.items.map((item) => ({
				day_of_week: item.day_of_week ?? 0,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				headcount_override: item.headcount_override ?? null,
			})),
		})
		dispatch({ type: "SET_INITIALIZED" })
	}, [template, initialized])

	/** Retorna as preparações de uma célula (dia + tipo de refeição) com seus headcounts individuais. */
	const getCellItems = (dayOfWeek: number, mealTypeId: string): RecipeWithHeadcount[] => {
		const cellItems = items.filter((i) => i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId)
		return cellItems.flatMap((item) => {
			const recipe = allRecipes?.find((r) => r.id === item.recipe_id)
			if (!recipe) return []
			return [{ ...recipe, headcountOverride: item.headcount_override ?? null }]
		})
	}

	/** Atualiza o headcount de uma preparação específica dentro de uma célula. */
	const handleItemHeadcountChange = (dayOfWeek: number, mealTypeId: string, recipeId: string, value: number | null) => {
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) =>
				i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, headcount_override: value } : i
			),
		})
	}

	const handleOpenSelector = (dayOfWeek: number, mealTypeId: string) => {
		dispatch({ type: "SET_SELECTED_CELL", value: { dayOfWeek, mealTypeId } })
		dispatch({ type: "SET_SELECTOR_OPEN", value: true })
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedCell) return
		// Preserva o headcount individual de cada preparação que permanece na célula
		const existingItems = items.filter((i) => i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId)
		const existingHeadcounts = new Map(existingItems.map((i) => [i.recipe_id, i.headcount_override ?? null]))
		const filtered = items.filter((i) => !(i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId))
		const newItems = recipeIds.map((recipeId) => ({
			day_of_week: selectedCell.dayOfWeek,
			meal_type_id: selectedCell.mealTypeId,
			recipe_id: recipeId,
			headcount_override: existingHeadcounts.get(recipeId) ?? null,
		}))
		dispatch({ type: "SET_ITEMS", value: [...filtered, ...newItems] })
		dispatch({ type: "SET_SELECTED_CELL", value: null })
	}

	const handleRemoveRecipe = (dayOfWeek: number, mealTypeId: string, recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: items.filter((i) => !(i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId)) })
	}

	const currentCellRecipeIds = selectedCell
		? items.filter((i) => i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId).map((i) => i.recipe_id)
		: []

	const handleSave = () => {
		if (!name.trim()) return
		updateTemplate(
			{
				id: weeklyMenuId as string,
				updates: {
					name: name.trim(),
					description: description.trim() || null,
				},
				items: items.map((i) => ({
					day_of_week: i.day_of_week,
					meal_type_id: i.meal_type_id,
					recipe_id: i.recipe_id,
					headcount_override: i.headcount_override ?? null,
				})),
			},
			{
				onSuccess: () => {
					navigate({
						to: "/kitchen/$kitchenId/weekly-menus",
						params: { kitchenId: kitchenIdStr as string },
					})
				},
			}
		)
	}

	const recipeMap = new Map(allRecipes?.map((r) => [r.id, r.name ?? r.id]) ?? [])
	const totalRecipes = items.length
	const daysWithContent = WEEKDAYS.filter((d) => items.some((i) => i.day_of_week === d.num)).length

	if (templateLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!template) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				<p className="text-subheading">Cardápio semanal não encontrado.</p>
				<Link
					to="/kitchen/$kitchenId/weekly-menus"
					params={{ kitchenId: kitchenIdStr as string }}
					className="text-sm text-primary mt-2 flex items-center justify-center hover:underline"
				>
					← Voltar para listagem
				</Link>
			</div>
		)
	}

	const isFork = !!template.base_template_id

	return (
		<TooltipProvider>
			<div className="space-y-6">
				<PageHeader
					title="Editar Cardápio Semanal"
					onBack={() =>
						navigate({
							to: "/kitchen/$kitchenId/weekly-menus",
							params: { kitchenId: kitchenIdStr as string },
						})
					}
				>
					<div className="flex items-center gap-2">
						<Button
							nativeButton={false}
							type="button"
							variant="outline"
							size="sm"
							render={
								<Link to="/kitchen/$kitchenId/weekly-menus" params={{ kitchenId: kitchenIdStr as string }}>
									Cancelar
								</Link>
							}
						/>
						<Button size="sm" disabled={isSaving || !name.trim()} onClick={handleSave}>
							{isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
							Salvar
						</Button>
					</div>
				</PageHeader>

				<div className="space-y-6">
					{/* Metadata */}
					<Card>
						<CardContent>
							<FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<FieldLabel htmlFor="name">
										Nome <span className="text-destructive">*</span>
									</FieldLabel>
									<Input
										id="name"
										value={name}
										onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
										placeholder="Ex.: Semana Padrão"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
									<Input
										id="description"
										value={description}
										onChange={(e) => dispatch({ type: "SET_DESCRIPTION", value: e.target.value })}
										placeholder="Breve descrição"
									/>
								</Field>
							</FieldGroup>
							{isFork && (
								<div className="mt-4 flex items-center gap-2">
									<GitFork className="size-3.5 text-muted-foreground" />
									<span className="text-xs text-muted-foreground">Adaptado do plano global da SDAB</span>
									<Badge variant="outline" className="text-xs">
										Independente — alterações no original não afetam este cardápio
									</Badge>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Tabs: Visão Geral + dias */}
					<Tabs value={activeTab} onValueChange={(v) => dispatch({ type: "SET_ACTIVE_TAB", value: v })}>
						<TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden">
							<TabsTrigger value="overview" className="gap-1.5">
								<span>Visão Geral</span>
								{totalRecipes > 0 && (
									<Badge variant="secondary" className="text-xs ml-1">
										{totalRecipes}
									</Badge>
								)}
							</TabsTrigger>
							{WEEKDAYS.map((day) => {
								const count = items.filter((i) => i.day_of_week === day.num).length
								return (
									<TabsTrigger key={day.num} value={String(day.num)} className="gap-1">
										{day.abbr}
										{count > 0 && (
											<Badge variant="secondary" className="text-xs">
												{count}
											</Badge>
										)}
									</TabsTrigger>
								)
							})}
						</TabsList>

						<TabsContent value="overview" className="mt-4 space-y-4 h-full">
							<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
								<span>
									<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "receita" : "Preparações"} no cardápio
								</span>
								<span className="text-muted-foreground/40">·</span>
								<span>
									<strong className="text-foreground tabular-nums">{daysWithContent}</strong>/7 dias preenchidos
								</span>
							</div>

							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 h-full">
								{WEEKDAYS.map((day) => (
									<DayOverviewCard
										key={day.num}
										day={day}
										mealTypes={mealTypes ?? []}
										items={items}
										recipeMap={recipeMap}
										onNavigate={() => dispatch({ type: "SET_ACTIVE_TAB", value: String(day.num) })}
									/>
								))}
							</div>

							{totalRecipes === 0 && (
								<div className="rounded-md border border-dashed p-10 text-center">
									<p className="text-sm text-muted-foreground mb-1">Cardápio vazio — nenhuma receita atribuída ainda.</p>
									<p className="text-xs text-muted-foreground/60">Clique em um dia acima ou use as abas para começar.</p>
								</div>
							)}
						</TabsContent>

						{WEEKDAYS.map((day) => (
							<TabsContent key={day.num} value={String(day.num)} className="mt-4 space-y-3">
								<div className="flex items-center justify-between px-1">
									<h2 className="text-sm text-heading">{day.label}</h2>
									<span className="text-xs text-muted-foreground">
										{items.filter((i) => i.day_of_week === day.num).length} receita
										{items.filter((i) => i.day_of_week === day.num).length !== 1 ? "s" : ""}
									</span>
								</div>

								{mealTypes && mealTypes.length > 0 ? (
									mealTypes.map((mealType) => (
										<DayMealSection
											key={mealType.id}
											mealType={mealType}
											recipes={getCellItems(day.num, mealType.id)}
											onOpenSelector={() => handleOpenSelector(day.num, mealType.id)}
											onRemoveRecipe={(recipeId) => handleRemoveRecipe(day.num, mealType.id, recipeId)}
											onItemHeadcountChange={(recipeId, value) => handleItemHeadcountChange(day.num, mealType.id, recipeId, value)}
										/>
									))
								) : (
									<div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
										Nenhum tipo de refeição disponível. Configure os tipos de refeição no Planejamento.
									</div>
								)}
							</TabsContent>
						))}
					</Tabs>
				</div>

				<RecipeSelector
					open={selectorOpen}
					onClose={() => {
						dispatch({ type: "SET_SELECTOR_OPEN", value: false })
						dispatch({ type: "SET_SELECTED_CELL", value: null })
					}}
					kitchenId={kitchenId}
					selectedRecipeIds={currentCellRecipeIds}
					onSelect={handleSelectRecipes}
					multiSelect
				/>
			</div>
		</TooltipProvider>
	)
}
