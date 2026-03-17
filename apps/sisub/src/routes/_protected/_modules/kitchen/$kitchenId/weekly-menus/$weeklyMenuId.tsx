import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { CheckCircle2, Circle, GitFork, Loader2, Plus, Save, X } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
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
import type { Recipe } from "@/types/supabase.types"

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
				<span className="text-sm font-semibold">{day.abbr}</span>
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
							{count > 0 ? (
								<CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
							) : (
								<Circle className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
							)}
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
														<Loader2 className="h-3 w-3 animate-spin" />
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
}: {
	mealType: MealType
	recipes: Recipe[]
	onOpenSelector: () => void
	onRemoveRecipe: (recipeId: string) => void
}) {
	const hasRecipes = recipes.length > 0

	return (
		<Card className="overflow-hidden p-0 gap-0">
			<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{mealType.name}</span>
					{hasRecipes && (
						<Badge variant="secondary" className="text-xs">
							{recipes.length}
						</Badge>
					)}
				</div>
				<Button type="button" size="sm" variant="ghost" onClick={onOpenSelector} className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground">
					<Plus className="h-3.5 w-3.5" />
					Adicionar
				</Button>
			</div>

			{hasRecipes ? (
				<div className="p-3 space-y-1.5">
					{recipes.map((recipe) => (
						<div key={recipe.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30 group hover:bg-muted/60 transition-colors">
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">{recipe.name}</p>
								{recipe.rational_id && <p className="text-xs text-muted-foreground font-mono">{recipe.rational_id}</p>}
							</div>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
											onClick={() => onRemoveRecipe(recipe.id)}
										>
											<X className="h-3.5 w-3.5" />
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
						<Plus className="h-3.5 w-3.5 mr-1" />
						Adicionar Preparações
					</Button>
				</div>
			)}
		</Card>
	)
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

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [items, setItems] = useState<TemplateItemDraft[]>([])
	const [initialized, setInitialized] = useState(false)
	const [activeTab, setActiveTab] = useState("overview")
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [selectedCell, setSelectedCell] = useState<{
		dayOfWeek: number
		mealTypeId: string
	} | null>(null)

	if (template && !initialized) {
		setName(template.name ?? "")
		setDescription(template.description ?? "")
		setItems(
			template.items.map((item) => ({
				day_of_week: item.day_of_week ?? 0,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
			}))
		)
		setInitialized(true)
	}

	const getCellRecipes = (dayOfWeek: number, mealTypeId: string): Recipe[] => {
		const ids = items.filter((i) => i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId).map((i) => i.recipe_id)
		return allRecipes?.filter((r) => ids.includes(r.id)) ?? []
	}

	const handleOpenSelector = (dayOfWeek: number, mealTypeId: string) => {
		setSelectedCell({ dayOfWeek, mealTypeId })
		setSelectorOpen(true)
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedCell) return
		const filtered = items.filter((i) => !(i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId))
		const newItems = recipeIds.map((recipeId) => ({
			day_of_week: selectedCell.dayOfWeek,
			meal_type_id: selectedCell.mealTypeId,
			recipe_id: recipeId,
		}))
		setItems([...filtered, ...newItems])
		setSelectedCell(null)
	}

	const handleRemoveRecipe = (dayOfWeek: number, mealTypeId: string, recipeId: string) => {
		setItems(items.filter((i) => !(i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId)))
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
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!template) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				<p className="text-sm font-medium">Cardápio semanal não encontrado.</p>
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
							{isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
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
									<Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Semana Padrão" required />
								</Field>
								<Field>
									<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
									<Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição" />
								</Field>
							</FieldGroup>
							{isFork && (
								<div className="mt-4 flex items-center gap-2">
									<GitFork className="w-3.5 h-3.5 text-muted-foreground" />
									<span className="text-xs text-muted-foreground">Fork de plano global da SDAB</span>
									<Badge variant="outline" className="text-xs">
										Independente — alterações no original não afetam este cardápio
									</Badge>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Tabs: Visão Geral + dias */}
					<Tabs value={activeTab} onValueChange={setActiveTab}>
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
										onNavigate={() => setActiveTab(String(day.num))}
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
									<h2 className="text-sm font-semibold">{day.label}</h2>
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
											recipes={getCellRecipes(day.num, mealType.id)}
											onOpenSelector={() => handleOpenSelector(day.num, mealType.id)}
											onRemoveRecipe={(recipeId) => handleRemoveRecipe(day.num, mealType.id, recipeId)}
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
						setSelectorOpen(false)
						setSelectedCell(null)
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
