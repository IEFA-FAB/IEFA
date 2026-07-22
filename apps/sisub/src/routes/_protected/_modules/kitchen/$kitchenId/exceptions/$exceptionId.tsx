import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { CalendarPlus, Check, Loader2, Save } from "lucide-react"
import { useEffect, useReducer, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ApplyEventDialog } from "@/components/features/local/planning/ApplyEventDialog"
import type { RecipeWithHeadcount } from "@/components/features/local/planning/MealTypeSection"
import { MealTypeSection } from "@/components/features/local/planning/MealTypeSection"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useTemplate, useUpdateTemplate } from "@/hooks/data/useTemplates"
import type { TemplateItemDraft } from "@/types/domain/planning"

/**
 * KITCHEN — Editor de Exceção
 * URL: /kitchen/:kitchenId/exceptions/:exceptionId
 *
 * Exceções são refeições previsíveis fora da rotina semanal (lanche de bordo, café de
 * reunião). Como os eventos, não têm estrutura de dias/semana — apenas grupos de
 * preparações por tipo de refeição, com headcount por preparação. O campo de ocorrências
 * mensais multiplica o custeio na Ata.
 *
 * Na camada de dados, day_of_week é fixado em EXCEPTION_DAY (1) para todos os itens,
 * pois a coluna é obrigatória no schema mas não tem significado semântico aqui.
 */
const EXCEPTION_DAY = 1

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/$exceptionId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: ExceptionEditorPage,
	head: () => ({
		meta: [{ title: "Editar Exceção - SISUB" }],
	}),
})

// ─── Reducer ─────────────────────────────────────────────────────────────────

type ExceptionEditorState = {
	name: string
	description: string
	occurrences: string
	items: TemplateItemDraft[]
	initialized: boolean
	selectorOpen: boolean
	selectedMealTypeId: string | null
}

type ExceptionEditorAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_DESCRIPTION"; value: string }
	| { type: "SET_OCCURRENCES"; value: string }
	| { type: "SET_ITEMS"; value: TemplateItemDraft[] }
	| { type: "SET_INITIALIZED" }
	| { type: "SET_SELECTOR_OPEN"; value: boolean }
	| { type: "SET_SELECTED_MEAL_TYPE_ID"; value: string | null }

const initialExceptionEditorState: ExceptionEditorState = {
	name: "",
	description: "",
	occurrences: "",
	items: [],
	initialized: false,
	selectorOpen: false,
	selectedMealTypeId: null,
}

function exceptionEditorReducer(state: ExceptionEditorState, action: ExceptionEditorAction): ExceptionEditorState {
	switch (action.type) {
		case "SET_NAME":
			return { ...state, name: action.value }
		case "SET_DESCRIPTION":
			return { ...state, description: action.value }
		case "SET_OCCURRENCES":
			return { ...state, occurrences: action.value }
		case "SET_ITEMS":
			return { ...state, items: action.value }
		case "SET_INITIALIZED":
			return { ...state, initialized: true }
		case "SET_SELECTOR_OPEN":
			return { ...state, selectorOpen: action.value }
		case "SET_SELECTED_MEAL_TYPE_ID":
			return { ...state, selectedMealTypeId: action.value }
		default:
			return state
	}
}

/** "" → null; senão inteiro positivo (nulo se inválido). */
function parseOccurrences(value: string): number | null {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ExceptionEditorPage() {
	const { kitchenId: kitchenIdStr, exceptionId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(exceptionId as string)
	const { data: mealTypes } = useMealTypes(kitchenId)
	const { data: allRecipes } = useRecipes()
	const { mutate: updateTemplate, isPending: isSaving } = useUpdateTemplate()
	const { mutate: autoSave } = useUpdateTemplate({ silent: true })

	const [editorState, dispatch] = useReducer(exceptionEditorReducer, initialExceptionEditorState)
	const { name, description, occurrences, items, initialized, selectorOpen, selectedMealTypeId } = editorState

	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
	const [applyOpen, setApplyOpen] = useState(false)
	const prevInitializedRef = useRef(false)
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!template || initialized) return
		dispatch({ type: "SET_NAME", value: template.name ?? "" })
		dispatch({ type: "SET_DESCRIPTION", value: template.description ?? "" })
		dispatch({ type: "SET_OCCURRENCES", value: template.expected_monthly_occurrences != null ? String(template.expected_monthly_occurrences) : "" })
		dispatch({
			type: "SET_ITEMS",
			value: template.items.map((item) => ({
				day_of_week: EXCEPTION_DAY,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				headcount_override: item.headcount_override ?? null,
			})),
		})
		dispatch({ type: "SET_INITIALIZED" })
	}, [template, initialized])

	useEffect(() => {
		if (!initialized) return
		if (!prevInitializedRef.current) {
			prevInitializedRef.current = true
			return
		}
		if (!name.trim()) return
		setSaveStatus("idle")
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		autoSaveTimerRef.current = setTimeout(() => {
			setSaveStatus("saving")
			autoSave(
				{
					id: exceptionId as string,
					updates: { name: name.trim(), description: description.trim() || null, expected_monthly_occurrences: parseOccurrences(occurrences) },
					items: items.map((i) => ({
						day_of_week: EXCEPTION_DAY,
						meal_type_id: i.meal_type_id,
						recipe_id: i.recipe_id,
						headcount_override: i.headcount_override,
					})),
				},
				{
					onSuccess: () => setSaveStatus("saved"),
					onError: () => setSaveStatus("idle"),
				}
			)
		}, 1500)
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		}
	}, [name, description, occurrences, items, initialized, autoSave, exceptionId])

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
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) => (i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, headcount_override: value } : i)),
		})
	}

	const handleOpenSelector = (mealTypeId: string) => {
		dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: mealTypeId })
		dispatch({ type: "SET_SELECTOR_OPEN", value: true })
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedMealTypeId) return
		// Preserva o headcount individual de cada preparação que permanece no grupo
		const existingItems = items.filter((i) => i.meal_type_id === selectedMealTypeId)
		const existingHeadcounts = new Map(existingItems.map((i) => [i.recipe_id, i.headcount_override ?? null]))
		const filtered = items.filter((i) => i.meal_type_id !== selectedMealTypeId)
		const newItems = recipeIds.map((recipeId) => ({
			day_of_week: EXCEPTION_DAY,
			meal_type_id: selectedMealTypeId,
			recipe_id: recipeId,
			headcount_override: existingHeadcounts.get(recipeId) ?? null,
		}))
		dispatch({ type: "SET_ITEMS", value: [...filtered, ...newItems] })
		dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: null })
	}

	const handleRemoveRecipe = (mealTypeId: string, recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: items.filter((i) => !(i.meal_type_id === mealTypeId && i.recipe_id === recipeId)) })
	}

	const handleSave = () => {
		if (!name.trim()) return
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		updateTemplate(
			{
				id: exceptionId as string,
				updates: {
					name: name.trim(),
					description: description.trim() || null,
					expected_monthly_occurrences: parseOccurrences(occurrences),
				},
				items: items.map((i) => ({
					day_of_week: EXCEPTION_DAY,
					meal_type_id: i.meal_type_id,
					recipe_id: i.recipe_id,
					headcount_override: i.headcount_override ?? null,
				})),
			},
			{
				onSuccess: () => {
					navigate({
						to: "/kitchen/$kitchenId/exceptions",
						params: { kitchenId: kitchenIdStr as string },
					})
				},
			}
		)
	}

	// ── Derived state ──────────────────────────────────────────────────────────

	const totalRecipes = items.length
	const groupsWithContent = mealTypes?.filter((mt) => items.some((i) => i.meal_type_id === mt.id)).length ?? 0

	const currentSelectorRecipeIds = selectedMealTypeId ? items.flatMap((i) => (i.meal_type_id === selectedMealTypeId ? [i.recipe_id] : [])) : []

	// ── Render ─────────────────────────────────────────────────────────────────

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
				<p className="text-subheading">Exceção não encontrada.</p>
				<Link
					to="/kitchen/$kitchenId/exceptions"
					params={{ kitchenId: kitchenIdStr as string }}
					className="text-sm text-primary mt-2 flex items-center justify-center hover:underline"
				>
					← Voltar para exceções
				</Link>
			</div>
		)
	}

	return (
		<TooltipProvider>
			<div className="space-y-6">
				<PageHeader
					title="Editar Exceção"
					onBack={() =>
						navigate({
							to: "/kitchen/$kitchenId/exceptions",
							params: { kitchenId: kitchenIdStr as string },
						})
					}
				>
					<div className="flex items-center gap-2">
						{saveStatus === "saving" && (
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<Loader2 className="size-3 animate-spin" />
								Salvando...
							</span>
						)}
						{saveStatus === "saved" && (
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<Check className="size-3 text-success" />
								Salvo
							</span>
						)}
						<Button variant="outline" size="sm" disabled={totalRecipes === 0} onClick={() => setApplyOpen(true)}>
							<CalendarPlus className="size-4 mr-2" />
							Aplicar ao Calendário
						</Button>
						<Button
							nativeButton={false}
							type="button"
							variant="outline"
							size="sm"
							render={
								<Link to="/kitchen/$kitchenId/exceptions" params={{ kitchenId: kitchenIdStr as string }}>
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
							<FieldGroup className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<Field>
									<FieldLabel htmlFor="name">
										Nome <span className="text-destructive">*</span>
									</FieldLabel>
									<Input
										id="name"
										value={name}
										onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
										placeholder="Ex.: Lanche de Bordo"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="occurrences">Ocorrências/mês</FieldLabel>
									<Input
										id="occurrences"
										type="number"
										min={1}
										inputMode="numeric"
										value={occurrences}
										onChange={(e) => dispatch({ type: "SET_OCCURRENCES", value: e.target.value })}
										placeholder="Ex.: 30"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
									<Input
										id="description"
										value={description}
										onChange={(e) => dispatch({ type: "SET_DESCRIPTION", value: e.target.value })}
										placeholder="Contexto ou observações"
									/>
								</Field>
							</FieldGroup>
						</CardContent>
					</Card>

					{/* Sumário */}
					{(totalRecipes > 0 || (mealTypes && mealTypes.length > 0)) && (
						<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
							<span>
								<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "preparação" : "preparações"} na exceção
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
								<MealTypeSection
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
						dispatch({ type: "SET_SELECTOR_OPEN", value: false })
						dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: null })
					}}
					kitchenId={kitchenId}
					selectedRecipeIds={currentSelectorRecipeIds}
					onSelect={handleSelectRecipes}
					multiSelect
				/>

				<ApplyEventDialog
					open={applyOpen}
					onClose={() => setApplyOpen(false)}
					templateId={exceptionId as string}
					templateName={name || "Exceção"}
					templateType="exception"
					kitchenId={kitchenId}
				/>
			</div>
		</TooltipProvider>
	)
}
