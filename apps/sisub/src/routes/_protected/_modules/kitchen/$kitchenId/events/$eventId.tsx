import type { Recipe } from "@iefa/database/sisub"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { Loader2, Plus, Save, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useTemplate, useUpdateTemplate } from "@/hooks/data/useTemplates"
import type { TemplateItemDraft } from "@/types/domain/planning"

/**
 * KITCHEN — Editor de Evento
 * URL: /kitchen/:kitchenId/events/:eventId
 *
 * Eventos são cardápios de ocasião única (jantar de formatura, rancho de manobra…).
 * Não têm estrutura de dias/semana — apenas grupos de preparações organizados
 * por tipo de refeição (Almoço, Jantar, etc.).
 *
 * O headcount é definido por preparação: cada receita tem seu próprio
 * headcount_override, permitindo grupos mistos (ex.: 50 pax no macarrão,
 * 100 pax na alcatra, dentro do mesmo Almoço).
 *
 * Na camada de dados, day_of_week é fixado em EVENT_DAY (1) para todos os itens,
 * pois a coluna é obrigatória no schema mas não tem significado semântico aqui.
 */
const EVENT_DAY = 1

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/$eventId")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: EventEditorPage,
	head: () => ({
		meta: [{ title: "Editar Evento - SISUB" }],
	}),
})

// ─── Sub-components ──────────────────────────────────────────────────────────

type MealType = { id: string; name: string | null }
type RecipeWithHeadcount = Recipe & { headcountOverride: number | null }

function EventGroupSection({
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
	/** Atualiza o headcount de uma preparação específica dentro do grupo. */
	onItemHeadcountChange: (recipeId: string, value: number | null) => void
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
						<div key={recipe.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 group hover:bg-muted/60 transition-colors">
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">{recipe.name}</p>
								{recipe.rational_id && <p className="text-xs text-muted-foreground font-mono">{recipe.rational_id}</p>}
							</div>

							{/* Comensais por preparação */}
							<Tooltip>
								<TooltipTrigger className="flex items-center gap-1 shrink-0 cursor-default" onClick={(e) => e.stopPropagation()}>
									<Users className="h-3 w-3 text-muted-foreground" />
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
									<p className="text-xs font-medium">Comensais desta preparação</p>
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
					<p className="text-xs text-muted-foreground mb-2">Nenhuma preparação atribuída</p>
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

function EventEditorPage() {
	const { kitchenId: kitchenIdStr, eventId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(eventId as string)
	const { data: mealTypes } = useMealTypes(kitchenId)
	const { data: allRecipes } = useRecipes()
	const { mutate: updateTemplate, isPending: isSaving } = useUpdateTemplate()

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [items, setItems] = useState<TemplateItemDraft[]>([])
	const [initialized, setInitialized] = useState(false)
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [selectedMealTypeId, setSelectedMealTypeId] = useState<string | null>(null)

	useEffect(() => {
		if (!template || initialized) return
		setName(template.name ?? "")
		setDescription(template.description ?? "")
		setItems(
			template.items.map((item) => ({
				day_of_week: EVENT_DAY,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				headcount_override: item.headcount_override ?? null,
			}))
		)
		setInitialized(true)
	}, [template, initialized])

	// ── Helpers ────────────────────────────────────────────────────────────────

	/** Retorna as preparações de um grupo com seus headcounts individuais. */
	const getGroupItems = (mealTypeId: string): RecipeWithHeadcount[] => {
		const groupItems = items.filter((i) => i.meal_type_id === mealTypeId)
		return groupItems.flatMap((item) => {
			const recipe = allRecipes?.find((r) => r.id === item.recipe_id)
			if (!recipe) return []
			return [{ ...recipe, headcountOverride: item.headcount_override ?? null }]
		})
	}

	/** Atualiza o headcount de uma preparação específica dentro de um grupo. */
	const handleItemHeadcountChange = (mealTypeId: string, recipeId: string, value: number | null) => {
		setItems((prev) => prev.map((i) => (i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, headcount_override: value } : i)))
	}

	const handleOpenSelector = (mealTypeId: string) => {
		setSelectedMealTypeId(mealTypeId)
		setSelectorOpen(true)
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedMealTypeId) return
		// Preserva o headcount individual de cada preparação que permanece no grupo
		const existingItems = items.filter((i) => i.meal_type_id === selectedMealTypeId)
		const existingHeadcounts = new Map(existingItems.map((i) => [i.recipe_id, i.headcount_override ?? null]))
		const filtered = items.filter((i) => i.meal_type_id !== selectedMealTypeId)
		const newItems = recipeIds.map((recipeId) => ({
			day_of_week: EVENT_DAY,
			meal_type_id: selectedMealTypeId,
			recipe_id: recipeId,
			headcount_override: existingHeadcounts.get(recipeId) ?? null,
		}))
		setItems([...filtered, ...newItems])
		setSelectedMealTypeId(null)
	}

	const handleRemoveRecipe = (mealTypeId: string, recipeId: string) => {
		setItems(items.filter((i) => !(i.meal_type_id === mealTypeId && i.recipe_id === recipeId)))
	}

	const handleSave = () => {
		if (!name.trim()) return
		updateTemplate(
			{
				id: eventId as string,
				updates: {
					name: name.trim(),
					description: description.trim() || null,
				},
				items: items.map((i) => ({
					day_of_week: EVENT_DAY,
					meal_type_id: i.meal_type_id,
					recipe_id: i.recipe_id,
					headcount_override: i.headcount_override ?? null,
				})),
			},
			{
				onSuccess: () => {
					navigate({
						to: "/kitchen/$kitchenId/events",
						params: { kitchenId: kitchenIdStr as string },
					})
				},
			}
		)
	}

	// ── Derived state ──────────────────────────────────────────────────────────

	const totalRecipes = items.length
	const groupsWithContent = mealTypes?.filter((mt) => items.some((i) => i.meal_type_id === mt.id)).length ?? 0

	const currentSelectorRecipeIds = selectedMealTypeId ? items.filter((i) => i.meal_type_id === selectedMealTypeId).map((i) => i.recipe_id) : []

	// ── Render ─────────────────────────────────────────────────────────────────

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
				<p className="text-sm font-medium">Evento não encontrado.</p>
				<Link
					to="/kitchen/$kitchenId/events"
					params={{ kitchenId: kitchenIdStr as string }}
					className="text-sm text-primary mt-2 flex items-center justify-center hover:underline"
				>
					← Voltar para eventos
				</Link>
			</div>
		)
	}

	return (
		<TooltipProvider>
			<div className="space-y-6">
				<PageHeader
					title="Editar Evento"
					onBack={() =>
						navigate({
							to: "/kitchen/$kitchenId/events",
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
								<Link to="/kitchen/$kitchenId/events" params={{ kitchenId: kitchenIdStr as string }}>
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
									<Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Almoço de Formatura" required />
								</Field>
								<Field>
									<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
									<Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto ou observações" />
								</Field>
							</FieldGroup>
						</CardContent>
					</Card>

					{/* Sumário */}
					{(totalRecipes > 0 || (mealTypes && mealTypes.length > 0)) && (
						<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
							<span>
								<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "preparação" : "preparações"} no evento
							</span>
							{mealTypes && mealTypes.length > 0 && (
								<>
									<span className="text-muted-foreground/40">·</span>
									<span>
										<strong className="text-foreground tabular-nums">{groupsWithContent}</strong>/{mealTypes.length} grupos preenchidos
									</span>
								</>
							)}
						</div>
					)}

					{/* Grupos de preparações */}
					{mealTypes && mealTypes.length > 0 ? (
						<div className="space-y-3">
							{mealTypes.map((mealType) => (
								<EventGroupSection
									key={mealType.id}
									mealType={mealType}
									recipes={getGroupItems(mealType.id)}
									onOpenSelector={() => handleOpenSelector(mealType.id)}
									onRemoveRecipe={(recipeId) => handleRemoveRecipe(mealType.id, recipeId)}
									onItemHeadcountChange={(recipeId, value) => handleItemHeadcountChange(mealType.id, recipeId, value)}
								/>
							))}
						</div>
					) : (
						<div className="rounded-md border border-dashed p-10 text-center">
							<p className="text-sm text-muted-foreground mb-1">Nenhum tipo de refeição configurado.</p>
							<p className="text-xs text-muted-foreground/60">Configure os tipos de refeição nas configurações da cozinha.</p>
						</div>
					)}
				</div>

				<RecipeSelector
					open={selectorOpen}
					onClose={() => {
						setSelectorOpen(false)
						setSelectedMealTypeId(null)
					}}
					kitchenId={kitchenId}
					selectedRecipeIds={currentSelectorRecipeIds}
					onSelect={handleSelectRecipes}
					multiSelect
				/>
			</div>
		</TooltipProvider>
	)
}
