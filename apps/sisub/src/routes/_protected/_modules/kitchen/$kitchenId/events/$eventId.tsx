import type { EditScope } from "@iefa/sisub-domain"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { CalendarPlus, Check, GitFork, ListChecks, Loader2, Save, Users } from "lucide-react"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ApplyEventDialog } from "@/components/features/local/planning/ApplyEventDialog"
import type { RecipeWithHeadcount } from "@/components/features/local/planning/MealTypeSection"
import { MealTypeSection } from "@/components/features/local/planning/MealTypeSection"
import { MenuFindBar } from "@/components/features/local/planning/MenuFindBar"
import { MenuHeadcountDialog } from "@/components/features/local/planning/MenuHeadcountDialog"
import { MenuSelectionBar } from "@/components/features/local/planning/MenuSelectionBar"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { RecipeVersionBadge, RecipeVersionUpdateButton } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { UnsavedChangesGuard } from "@/components/features/local/planning/UnsavedChangesGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSaveTemplateEdit, useTemplate } from "@/hooks/data/useTemplates"
import {
	applyHeadcountToItems,
	countItemHeadcountTargets,
	type HeadcountPlan,
	menuItemKey,
	removeMenuItems,
	replaceMenuRecipe,
	setItemHeadcount,
} from "@/lib/menu-fill"
import { replaceRecipeVersions } from "@/lib/recipe-versions"
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
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: EventEditorPage,
	head: () => ({
		meta: [{ title: "Editar Evento - SISUB" }],
	}),
})

// ─── Reducer ─────────────────────────────────────────────────────────────────

type EventEditorState = {
	name: string
	description: string
	items: TemplateItemDraft[]
	initialized: boolean
	selectorOpen: boolean
	selectedMealTypeId: string | null
}

type EventEditorAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_DESCRIPTION"; value: string }
	| { type: "SET_ITEMS"; value: TemplateItemDraft[] }
	| { type: "SET_INITIALIZED" }
	| { type: "SET_SELECTOR_OPEN"; value: boolean }
	| { type: "SET_SELECTED_MEAL_TYPE_ID"; value: string | null }

const initialEventEditorState: EventEditorState = {
	name: "",
	description: "",
	items: [],
	initialized: false,
	selectorOpen: false,
	selectedMealTypeId: null,
}

function eventEditorReducer(state: EventEditorState, action: EventEditorAction): EventEditorState {
	switch (action.type) {
		case "SET_NAME":
			return { ...state, name: action.value }
		case "SET_DESCRIPTION":
			return { ...state, description: action.value }
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

// ─── Main Page ────────────────────────────────────────────────────────────────

function EventEditorPage() {
	const { kitchenId: kitchenIdStr, eventId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(eventId as string)
	const { data: mealTypes } = useMealTypes(kitchenId)
	// Catálogo global + as preparações DESTA cozinha. Sem o escopo, a listagem volta só com
	// as globais e a cozinha não enxergava as próprias preparações no cardápio.
	const { data: allRecipes } = useRecipes({ kitchen_id: kitchenId })
	// Contexto da edição = a rota. Template global editado aqui vira cópia local desta
	// cozinha; o global não é tocado. `menu_template` não é versionado, então a edição
	// in-place de um global sobrescreveria o plano da FAB inteira sem histórico.
	const editContext = useMemo<EditScope>(() => ({ scope: "kitchen", kitchenId }), [kitchenId])

	// Template global aberto numa cozinha: salvar vai forkar.
	const willFork = template != null && template.kitchen_id == null

	const { mutate: saveTemplate, isPending: isSaving } = useSaveTemplateEdit()
	const { mutate: autoSave } = useSaveTemplateEdit({ silent: true })

	const [editorState, dispatch] = useReducer(eventEditorReducer, initialEventEditorState)
	const { name, description, items, initialized, selectorOpen, selectedMealTypeId } = editorState
	const { recipeById, outdated, outdatedById } = useTemplateRecipeVersions(template?.items, allRecipes, items)

	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
	// Conteúdo recém-carregado já conta como gravado. Sem esta marca, `savedSignatureRef`
	// fica nulo e qualquer saída pareceria ter alteração pendente.
	const loadedSignatureRef = useRef(false)
	const [selectionMode, setSelectionMode] = useState(false)
	const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [headcountOpen, setHeadcountOpen] = useState(false)
	const [applyOpen, setApplyOpen] = useState(false)
	const prevInitializedRef = useRef(false)
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Conteúdo da última gravação bem-sucedida. O efeito de auto-save também reage à troca
	// de ROTA — salvar um template global aqui cria o fork e muda `eventId`/`willFork` —, e
	// sem esta comparação ele regravaria, 1,5s depois, o fork recém-criado inteiro.
	const savedSignatureRef = useRef<string | null>(null)
	const contentSignature = JSON.stringify({ name: name.trim(), description: description.trim(), items })
	// Lida pelo guarda de saída no momento da navegação, não na renderização.
	const contentSignatureRef = useRef(contentSignature)
	contentSignatureRef.current = contentSignature

	useEffect(() => {
		if (!template || initialized) return
		dispatch({ type: "SET_NAME", value: template.name ?? "" })
		dispatch({ type: "SET_DESCRIPTION", value: template.description ?? "" })
		dispatch({
			type: "SET_ITEMS",
			value: template.items.map((item) => ({
				day_of_week: EVENT_DAY,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				headcount_override: item.headcount_override ?? null,
			})),
		})
		dispatch({ type: "SET_INITIALIZED" })
	}, [template, initialized])

	useEffect(() => {
		if (!initialized || loadedSignatureRef.current) return
		loadedSignatureRef.current = true
		savedSignatureRef.current = contentSignature
	}, [initialized, contentSignature])

	useEffect(() => {
		if (!initialized) return
		if (!prevInitializedRef.current) {
			prevInitializedRef.current = true
			return
		}
		if (!name.trim()) return
		// Auto-save NÃO forka: criar uma cópia local no primeiro caractere digitado seria
		// uma bifurcação silenciosa. Num template global a cópia sai só do salvamento
		// explícito, depois do aviso.
		if (willFork) return
		// Nada mudou desde a última gravação (o efeito re-executou por troca de rota, não por
		// edição do usuário) — não há o que salvar.
		if (contentSignature === savedSignatureRef.current) return
		setSaveStatus("idle")
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		autoSaveTimerRef.current = setTimeout(() => {
			setSaveStatus("saving")
			autoSave(
				{
					id: eventId as string,
					context: editContext,
					updates: { name: name.trim(), description: description.trim() || null },
					items: items.map((i) => ({
						day_of_week: EVENT_DAY,
						meal_type_id: i.meal_type_id,
						recipe_id: i.recipe_id,
						headcount_override: i.headcount_override,
					})),
				},
				{
					onSuccess: () => {
						savedSignatureRef.current = contentSignature
						setSaveStatus("saved")
					},
					onError: () => setSaveStatus("idle"),
				}
			)
		}, 1500)
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		}
	}, [name, description, items, initialized, willFork, editContext, autoSave, eventId, contentSignature])

	// ── Helpers ────────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!highlightedKey) return
		const frame = requestAnimationFrame(() => {
			document.getElementById(highlightedKey)?.scrollIntoView({ block: "center", behavior: "smooth" })
		})
		const timer = setTimeout(() => setHighlightedKey(null), 2500)
		return () => {
			cancelAnimationFrame(frame)
			clearTimeout(timer)
		}
	}, [highlightedKey])

	/** Retorna as preparações de um grupo com seus headcounts individuais. */
	const getGroupItems = (mealTypeId: string): RecipeWithHeadcount[] => {
		const groupItems = items.filter((i) => i.meal_type_id === mealTypeId)
		return groupItems.flatMap((item) => {
			const recipe = recipeById.get(item.recipe_id)
			if (!recipe) return []
			return [
				{
					id: recipe.id,
					name: recipe.name,
					rational_id: recipe.rational_id ?? null,
					headcountOverride: item.headcount_override ?? null,
					badge: <RecipeVersionBadge outdated={outdatedById.get(recipe.id)} />,
					anchorId: menuItemKey(item),
					highlighted: highlightedKey === menuItemKey(item),
				},
			]
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
			day_of_week: EVENT_DAY,
			meal_type_id: selectedMealTypeId,
			recipe_id: recipeId,
			headcount_override: existingHeadcounts.get(recipeId) ?? null,
		}))
		dispatch({ type: "SET_ITEMS", value: [...filtered, ...newItems] })
		dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: null })
	}

	const handleUpdateVersions = (replacements: Map<string, string>) => {
		dispatch({ type: "SET_ITEMS", value: replaceRecipeVersions(items, replacements) })
	}

	const toggleSelection = (key: string, checked: boolean) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev)
			if (checked) next.add(key)
			else next.delete(key)
			return next
		})
	}

	const clearSelection = () => setSelectedKeys(new Set())

	const exitSelectionMode = () => {
		setSelectionMode(false)
		clearSelection()
	}

	/** Sem efetivo base aqui (`menu_template_meal` é do cardápio semanal): o quantitativo do
	 * auxiliador vai direto para o pax de cada preparação da refeição. */
	const handleApplyHeadcountPlan = (plan: HeadcountPlan, overwrite: boolean) => {
		dispatch({ type: "SET_ITEMS", value: applyHeadcountToItems(items, plan, { overwrite }) })
	}

	const handleBulkHeadcount = (headcount: number | null) => {
		dispatch({ type: "SET_ITEMS", value: setItemHeadcount(items, selectedKeys, headcount) })
	}

	const handleBulkRemove = () => {
		dispatch({ type: "SET_ITEMS", value: removeMenuItems(items, selectedKeys) })
		clearSelection()
	}

	const handleBulkReplace = (recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: replaceMenuRecipe(items, selectedKeys, recipeId) })
		clearSelection()
	}

	const handleRemoveRecipe = (mealTypeId: string, recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: items.filter((i) => !(i.meal_type_id === mealTypeId && i.recipe_id === recipeId)) })
	}

	const handleSave = () => {
		if (!name.trim()) return
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		saveTemplate(
			{
				id: eventId as string,
				context: editContext,
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
				// Salvar mantém o editor aberto — a tela já auto-salva em rascunho local, então
				// voltar para a listagem no salvamento explícito era o único ponto em que o
				// usuário perdia o lugar. O ÚNICO deslocamento é o fork: o save de um template
				// global cria a cópia local (id novo) e a URL precisa passar a apontar para ela,
				// senão a tela continuaria editando — e forkando de novo — o global.
				onSuccess: (result) => {
					savedSignatureRef.current = contentSignature
					const savedId = result?.template?.id
					if (savedId && savedId !== eventId) {
						navigate({
							to: "/kitchen/$kitchenId/events/$eventId",
							params: { kitchenId: kitchenIdStr as string, eventId: savedId },
							replace: true,
						})
					}
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
				<p className="text-subheading">Evento não encontrado.</p>
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
						<RecipeVersionUpdateButton outdated={outdated} onApply={handleUpdateVersions} />
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
								<Link to="/kitchen/$kitchenId/events" params={{ kitchenId: kitchenIdStr as string }}>
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

				{willFork && (
					<Alert>
						<GitFork className="size-4" />
						<AlertTitle>Modelo global</AlertTitle>
						<AlertDescription>
							Este evento é do catálogo global da SDAB. Ao salvar, uma cópia local desta cozinha é criada com as suas alterações — o modelo global permanece
							intacto e as demais unidades continuam vendo o original. O salvamento automático fica desligado até lá.
						</AlertDescription>
					</Alert>
				)}

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
										placeholder="Ex.: Almoço de Formatura"
										required
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

					{/* Preenchimento: localizar, quantitativo por refeição e seleção em massa */}
					<div className="flex flex-wrap items-center gap-2">
						<MenuFindBar
							items={items}
							nameOf={(recipeId) => recipeById.get(recipeId)?.name}
							mealTypeOrder={(mealTypes ?? []).map((m) => m.id)}
							dayLabel={null}
							mealLabel={(mealTypeId) => mealTypes?.find((m) => m.id === mealTypeId)?.name ?? "Refeição"}
							kitchenId={kitchenId}
							onGoTo={(match) => setHighlightedKey(match.key)}
							onReplaceAll={(keys, recipeId) => dispatch({ type: "SET_ITEMS", value: replaceMenuRecipe(items, keys, recipeId) })}
							onSelectMatches={(keys) => {
								setSelectionMode(true)
								setSelectedKeys(keys)
							}}
						/>
						<Button type="button" variant="outline" size="sm" onClick={() => setHeadcountOpen(true)}>
							<Users className="size-4 sm:mr-2" />
							<span className="hidden sm:inline">Quantitativo</span>
						</Button>
						<Button
							type="button"
							variant={selectionMode ? "default" : "outline"}
							size="sm"
							onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
						>
							<ListChecks className="size-4 sm:mr-2" />
							<span className="hidden sm:inline">{selectionMode ? "Sair da seleção" : "Selecionar"}</span>
						</Button>
					</div>

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
									selectionMode={selectionMode}
									selectedIds={new Set(items.filter((i) => i.meal_type_id === mealType.id && selectedKeys.has(menuItemKey(i))).map((i) => i.recipe_id))}
									onSelectChange={(recipeId, checked) =>
										toggleSelection(menuItemKey({ day_of_week: EVENT_DAY, meal_type_id: mealType.id, recipe_id: recipeId }), checked)
									}
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

				<MenuHeadcountDialog
					open={headcountOpen}
					onOpenChange={setHeadcountOpen}
					mealTypes={mealTypes ?? []}
					scope="item-headcount"
					countTargets={(plan, overwrite) => countItemHeadcountTargets(items, plan, { overwrite })}
					onApply={handleApplyHeadcountPlan}
				/>

				{selectionMode && selectedKeys.size > 0 && (
					<MenuSelectionBar
						count={selectedKeys.size}
						kitchenId={kitchenId}
						onSetHeadcount={handleBulkHeadcount}
						onReplace={handleBulkReplace}
						onRemove={handleBulkRemove}
						onClear={clearSelection}
					/>
				)}

				<UnsavedChangesGuard isDirty={() => savedSignatureRef.current !== null && contentSignatureRef.current !== savedSignatureRef.current} />

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
					templateId={eventId as string}
					templateName={name || "Evento"}
					templateType="event"
					kitchenId={kitchenId}
				/>
			</div>
		</TooltipProvider>
	)
}
