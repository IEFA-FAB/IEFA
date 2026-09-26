import type { EditScope } from "@iefa/sisub-domain"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { AlertCircle, CheckCircle2, Circle, ClipboardPaste, GitFork, ListChecks, Loader2, Percent, Plus, Printer, Save, Users } from "lucide-react"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { type BoardArrangement, type BoardItem, type DemandType, MealGroupBoard } from "@/components/features/local/planning/MealGroupBoard"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { MenuFindBar } from "@/components/features/local/planning/MenuFindBar"
import { MenuHeadcountDialog } from "@/components/features/local/planning/MenuHeadcountDialog"
import { MenuSelectionBar } from "@/components/features/local/planning/MenuSelectionBar"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { RecipeVersionBadge, RecipeVersionUpdateButton } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { UnsavedChangesGuard } from "@/components/features/local/planning/UnsavedChangesGuard"
import { type AutoSaveState, AutoSaveStatus } from "@/components/features/shared/AutoSaveStatus"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useMealTypeGroups } from "@/hooks/data/useMenuGroups"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSaveTemplateEdit, useTemplate } from "@/hooks/data/useTemplates"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { cn } from "@/lib/cn"
import {
	applyHeadcountToMeals,
	applyRecipeSelection,
	copyMenuItems,
	countHeadcountTargets,
	type HeadcountPlan,
	type MenuClipboardEntry,
	menuItemKey,
	pasteMenuItems,
	removeMenuItems,
	replaceMenuRecipe,
	setItemHeadcount,
} from "@/lib/menu-fill"
import type { MenuItemGroup } from "@/lib/menu-item-groups"
import { replaceRecipeVersions } from "@/lib/recipe-versions"
import type { TemplateItemDraft, TemplateMealDraft } from "@/types/domain/planning"

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
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: WeeklyMenuEditorPage,
})

// ─── Sub-components ──────────────────────────────────────────────────────────

function DayOverviewCard({
	day,
	mealTypes,
	items,
	meals,
	recipeMap,
	onNavigate,
}: {
	day: (typeof WEEKDAYS)[number]
	mealTypes: MealTypeInfo[]
	items: TemplateItemDraft[]
	/** Efetivo base por refeição — sem ele, depois do auxiliador não havia como ver o que faltou. */
	meals: TemplateMealDraft[]
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
					const base = meals.find((m) => m.day_of_week === day.num && m.meal_type_id === mt.id)?.base_headcount ?? null
					const entries = mtItems.map((i) => ({ id: i.recipe_id, name: recipeMap.get(i.recipe_id) }))
					return (
						<div key={mt.id} className="flex items-center gap-2">
							{count > 0 ? <CheckCircle2 className="size-3.5 text-success shrink-0" /> : <Circle className="size-3.5 text-muted-foreground/30 shrink-0" />}
							<span className={cn("text-xs truncate flex-1", count > 0 ? "text-foreground" : "text-muted-foreground/50")}>{mt.name}</span>
							{count > 0 &&
								(base == null ? (
									<span className="text-xs text-warning shrink-0">sem efetivo</span>
								) : (
									<span className="text-xs text-muted-foreground shrink-0 tabular-nums">{base}</span>
								))}
							{count > 0 && (
								<Tooltip>
									<TooltipTrigger
										// span, não button: o card do dia inteiro já é um <button>, e button aninhado quebra a hidratação.
										render={<span />}
										className="text-xs text-muted-foreground shrink-0 tabular-nums underline decoration-dotted cursor-default"
										onClick={(e) => e.stopPropagation()}
									>
										×{count}
									</TooltipTrigger>
									<TooltipContent side="left">
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

// ─── Reducer ─────────────────────────────────────────────────────────────────

type WeeklyMenuEditorState = {
	name: string
	description: string
	items: TemplateItemDraft[]
	meals: TemplateMealDraft[]
	initialized: boolean
	activeTab: string
	selectorOpen: boolean
	selectedCell: { dayOfWeek: number; mealTypeId: string; group: MenuItemGroup | null } | null
}

type WeeklyMenuEditorAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_DESCRIPTION"; value: string }
	| { type: "SET_ITEMS"; value: TemplateItemDraft[] }
	| { type: "SET_MEALS"; value: TemplateMealDraft[] }
	| { type: "SET_INITIALIZED" }
	| { type: "SET_ACTIVE_TAB"; value: string }
	| { type: "SET_SELECTOR_OPEN"; value: boolean }
	| { type: "SET_SELECTED_CELL"; value: { dayOfWeek: number; mealTypeId: string; group: MenuItemGroup | null } | null }

const initialWeeklyMenuEditorState: WeeklyMenuEditorState = {
	name: "",
	description: "",
	items: [],
	meals: [],
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
		case "SET_MEALS":
			return { ...state, meals: action.value }
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

const ALL_WEEKDAYS = WEEKDAYS.map((d) => d.num)

// ─── Main Page ────────────────────────────────────────────────────────────────

function WeeklyMenuEditorPage() {
	const { kitchenId: kitchenIdStr, weeklyMenuId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(weeklyMenuId as string)
	useCrumbLabel(template?.name)
	const { data: mealTypes } = useMealTypes(kitchenId)
	// Colunas do board saem do conjunto de grupos DA refeição (café tem pães, o
	// almoço tem salada) — não mais de uma lista fixa igual para todas.
	const { groupsFor, isError: groupsFailed } = useMealTypeGroups(kitchenId, mealTypes)
	// Catálogo global + as preparações DESTA cozinha. Sem o escopo, a listagem volta só com
	// as globais e a cozinha não enxergava as próprias preparações no cardápio.
	const { data: allRecipes } = useRecipes({ kitchen_id: kitchenId })
	// Contexto da edição = a rota. Template global editado aqui vira cópia local desta
	// cozinha; o global não é tocado. `menu_template` não é versionado, então a edição
	// in-place de um global sobrescreveria o plano da FAB inteira sem histórico.
	const editContext = useMemo<EditScope>(() => ({ scope: "kitchen", kitchenId }), [kitchenId])

	// Template global aberto numa cozinha: salvar vai forkar.
	const willFork = template != null && template.kitchen_id == null

	// Mesmo escopo: auto-save e "Salvar" gravam em fila, na ordem em que foram disparados.
	const { mutate: saveTemplate, isPending: isSaving } = useSaveTemplateEdit({ scopeId: `template-save:${weeklyMenuId}` })
	const { mutate: autoSave } = useSaveTemplateEdit({ silent: true, scopeId: `template-save:${weeklyMenuId}` })

	const [editorState, dispatch] = useReducer(weeklyMenuEditorReducer, initialWeeklyMenuEditorState)
	const { name, description, items, meals, initialized, activeTab, selectorOpen, selectedCell } = editorState
	const { recipeById, outdated, outdatedById } = useTemplateRecipeVersions(template?.items, allRecipes, items)

	const [saveStatus, setSaveStatus] = useState<AutoSaveState>("idle")
	// Conteúdo recém-carregado já conta como gravado. Sem esta marca, `savedSignatureRef`
	// fica nulo e qualquer saída pareceria ter alteração pendente.
	const loadedSignatureRef = useRef(false)
	// O listener de atalho é montado uma vez; estes refs entregam o estado corrente a ele.
	const selectedKeysRef = useRef<ReadonlySet<string>>(new Set())
	const activeCellRef = useRef<{ day: number; mealTypeId: string } | null>(null)
	const copyKeysRef = useRef<(keys: ReadonlySet<string>) => void>(() => {})
	const pasteRef = useRef<(day: number, mealTypeId?: string) => void>(() => {})
	// Seleção em massa: a chave atravessa dia e refeição, então a mesma preparação em dois
	// dias são dois alvos distintos.
	const [selectionMode, setSelectionMode] = useState(false)
	const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [headcountOpen, setHeadcountOpen] = useState(false)
	// Outros dias em que a seleção do diálogo também entra (só adiciona, nunca remove).
	const [extraDays, setExtraDays] = useState<ReadonlySet<number>>(new Set())
	// Área de transferência do cardápio: sobrevive à navegação na aba, então dá para copiar
	// de um cardápio e colar em outro.
	const [clipboard, setClipboard] = usePersistentState<MenuClipboardEntry[]>(`sisub:menu:clipboard:${kitchenId}`, [])
	const [defaultDemandType, setDefaultDemandType] = usePersistentState<DemandType>("sisub:menu:demand-type", "headcount")
	// Alvo do Ctrl+V: a última refeição em que o usuário mexeu.
	const [activeCell, setActiveCell] = useState<{ day: number; mealTypeId: string } | null>(null)
	const prevInitializedRef = useRef(false)
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Conteúdo da última gravação bem-sucedida. O efeito de auto-save também reage à troca
	// de ROTA — salvar um template global aqui cria o fork e muda `weeklyMenuId`/`willFork`
	// —, e sem esta comparação ele regravaria, 1,5s depois, o fork recém-criado inteiro.
	const savedSignatureRef = useRef<string | null>(null)
	const contentSignature = JSON.stringify({ name: name.trim(), description: description.trim(), items, meals })
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
				day_of_week: item.day_of_week ?? 0,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				headcount_override: item.headcount_override ?? null,
				item_group: (item.item_group as MenuItemGroup | null) ?? null,
				sort_order: item.sort_order ?? 0,
				recommended_proportion: item.recommended_proportion ?? null,
			})),
		})
		dispatch({
			type: "SET_MEALS",
			value: (template.meals ?? []).map((m) => ({
				day_of_week: m.day_of_week,
				meal_type_id: m.meal_type_id,
				base_headcount: m.base_headcount ?? null,
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
					id: weeklyMenuId as string,
					context: editContext,
					updates: { name: name.trim(), description: description.trim() || null },
					items: items.map((i) => ({
						day_of_week: i.day_of_week,
						meal_type_id: i.meal_type_id,
						recipe_id: i.recipe_id,
						headcount_override: i.headcount_override,
						item_group: i.item_group ?? null,
						sort_order: i.sort_order ?? 0,
						recommended_proportion: i.recommended_proportion ?? null,
					})),
					meals,
				},
				{
					onSuccess: () => {
						savedSignatureRef.current = contentSignature
						setSaveStatus("saved")
					},
					onError: () => setSaveStatus("error"),
				}
			)
		}, 1500)
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		}
	}, [name, description, items, meals, initialized, willFork, editContext, autoSave, weeklyMenuId, contentSignature])

	// O localizar troca a aba do dia; a rolagem só pode acontecer depois que a aba pintou.
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

	// Ctrl+C copia a seleção, Ctrl+V cola na última refeição tocada. Campo de texto em foco
	// fica de fora: ali o atalho é o do navegador, copiando o texto digitado.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return
			const target = event.target as HTMLElement | null
			if (target?.closest("input, textarea, [contenteditable='true']")) return
			const key = event.key.toLowerCase()
			if (key === "c" && selectedKeysRef.current.size > 0) {
				event.preventDefault()
				copyKeysRef.current(selectedKeysRef.current)
			}
			if (key === "v" && activeCellRef.current) {
				event.preventDefault()
				pasteRef.current(activeCellRef.current.day, activeCellRef.current.mealTypeId)
			}
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [])

	/** Preparações de uma célula (dia + refeição) como BoardItem (grupo + ordem + proporção). */
	const getCellBoardItems = (dayOfWeek: number, mealTypeId: string): BoardItem[] => {
		const cellItems = items.filter((i) => i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId)
		return cellItems.flatMap((item) => {
			const recipe = recipeById.get(item.recipe_id)
			if (!recipe) return []
			return [
				{
					id: item.recipe_id,
					title: recipe.name ?? item.recipe_id,
					subtitle: recipe.rational_id ?? null,
					badge: <RecipeVersionBadge outdated={outdatedById.get(item.recipe_id)} />,
					anchorId: menuItemKey(item),
					highlighted: highlightedKey === menuItemKey(item),
					headcount: item.headcount_override ?? null,
					group: item.item_group ?? null,
					sortOrder: item.sort_order ?? 0,
					proportion: item.recommended_proportion ?? null,
				},
			]
		})
	}

	/** Persiste um rearranjo (drag-drop) da célula: reatribui grupo + reindexa a ordem dos itens. */
	const handleArrange = (dayOfWeek: number, mealTypeId: string, arrangement: BoardArrangement) => {
		const byRecipe = new Map(arrangement.map((a) => [a.id, a]))
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) => {
				if (i.day_of_week !== dayOfWeek || i.meal_type_id !== mealTypeId) return i
				const next = byRecipe.get(i.recipe_id)
				return next ? { ...i, item_group: next.group, sort_order: next.sortOrder } : i
			}),
		})
	}

	/** Atualiza a proporção recomendada de uma preparação da célula. */
	const handleProportionChange = (dayOfWeek: number, mealTypeId: string, recipeId: string, value: number | null) => {
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) =>
				i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, recommended_proportion: value } : i
			),
		})
	}

	/** Efetivo base (comensais) da refeição de um dia. Grão natural do efetivo; o headcount
	 * por-preparação abaixo é exceção. Só cria a linha quando há valor. */
	const getMealBase = (dayOfWeek: number, mealTypeId: string): number | null =>
		meals.find((m) => m.day_of_week === dayOfWeek && m.meal_type_id === mealTypeId)?.base_headcount ?? null

	const handleMealBaseChange = (dayOfWeek: number, mealTypeId: string, value: number | null) => {
		const exists = meals.some((m) => m.day_of_week === dayOfWeek && m.meal_type_id === mealTypeId)
		if (exists) {
			dispatch({
				type: "SET_MEALS",
				value: meals.map((m) => (m.day_of_week === dayOfWeek && m.meal_type_id === mealTypeId ? { ...m, base_headcount: value } : m)),
			})
		} else if (value !== null) {
			dispatch({ type: "SET_MEALS", value: [...meals, { day_of_week: dayOfWeek, meal_type_id: mealTypeId, base_headcount: value }] })
		}
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

	const handleOpenSelector = (dayOfWeek: number, mealTypeId: string, group: MenuItemGroup | null) => {
		setExtraDays(new Set())
		dispatch({ type: "SET_SELECTED_CELL", value: { dayOfWeek, mealTypeId, group } })
		dispatch({ type: "SET_SELECTOR_OPEN", value: true })
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedCell) return
		const { dayOfWeek, mealTypeId, group } = selectedCell
		// Origem: o diálogo define o conteúdo. Outros dias: só adiciona. Regras em `applyRecipeSelection`.
		const next = applyRecipeSelection(items, { day: dayOfWeek, mealTypeId, group }, recipeIds, extraDays, (draft) => ({
			...draft,
			item_group: draft.item_group as MenuItemGroup | null,
		}))
		dispatch({ type: "SET_ITEMS", value: next })
		dispatch({ type: "SET_SELECTED_CELL", value: null })
		setExtraDays(new Set())
	}

	const handleUpdateVersions = (replacements: Map<string, string>) => {
		dispatch({ type: "SET_ITEMS", value: replaceRecipeVersions(items, replacements) })
	}

	const handleRemoveRecipe = (dayOfWeek: number, mealTypeId: string, recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: items.filter((i) => !(i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId)) })
	}

	const currentCellRecipeIds = selectedCell
		? items.filter((i) => i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId).map((i) => i.recipe_id)
		: []

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

	/** Quantitativo do auxiliador → efetivo BASE da refeição, em todos os dias da semana.
	 * É o campo que alcança todas as preparações da refeição (`applyTemplate` deriva
	 * `override ?? base`); escrever preparação por preparação faria o mesmo número virar
	 * exceção em cada item. */
	const handleApplyHeadcountPlan = (plan: HeadcountPlan, overwrite: boolean) => {
		dispatch({ type: "SET_MEALS", value: applyHeadcountToMeals(meals, plan, { days: ALL_WEEKDAYS, overwrite }) })
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

	const handleCopyKeys = (keys: ReadonlySet<string>) => {
		const entries = copyMenuItems(items, keys)
		if (entries.length === 0) return
		setClipboard(entries)
		toast.success(`${entries.length} ${entries.length === 1 ? "preparação copiada" : "preparações copiadas"}`)
	}

	/** Cola na refeição indicada; sem refeição, cada preparação volta para a de origem (dia inteiro). */
	const handlePaste = (day: number, mealTypeId?: string) => {
		if (clipboard.length === 0) return
		const result = pasteMenuItems(items, clipboard, { day, mealTypeId }, (draft) => ({
			...draft,
			item_group: draft.item_group as MenuItemGroup | null,
		}))
		dispatch({ type: "SET_ITEMS", value: result.items })
		if (result.pasted === 0) toast.info("Estas preparações já estão nesta refeição")
		else if (result.skipped > 0) toast.success(`${result.pasted} coladas · ${result.skipped} já estavam lá`)
		else toast.success(`${result.pasted} ${result.pasted === 1 ? "preparação colada" : "preparações coladas"}`)
	}

	const handleSave = () => {
		if (!name.trim()) return
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		saveTemplate(
			{
				id: weeklyMenuId as string,
				context: editContext,
				updates: {
					name: name.trim(),
					description: description.trim() || null,
				},
				items: items.map((i) => ({
					day_of_week: i.day_of_week,
					meal_type_id: i.meal_type_id,
					recipe_id: i.recipe_id,
					headcount_override: i.headcount_override ?? null,
					item_group: i.item_group ?? null,
					sort_order: i.sort_order ?? 0,
					recommended_proportion: i.recommended_proportion ?? null,
				})),
				meals,
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
					if (savedId && savedId !== weeklyMenuId) {
						navigate({
							to: "/kitchen/$kitchenId/weekly-menus/$weeklyMenuId",
							params: { kitchenId: kitchenIdStr as string, weeklyMenuId: savedId },
							replace: true,
						})
					}
				},
			}
		)
	}

	selectedKeysRef.current = selectedKeys
	activeCellRef.current = activeCell
	copyKeysRef.current = handleCopyKeys
	pasteRef.current = handlePaste

	const recipeMap = new Map([...recipeById].map(([id, r]) => [id, r.name]))
	const mealTypeIds = (mealTypes ?? []).map((m) => m.id)
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
					<AutoSaveStatus status={saveStatus} />
					<RecipeVersionUpdateButton outdated={outdated} onApply={handleUpdateVersions} />
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									nativeButton={false}
									type="button"
									variant="outline"
									size="sm"
									render={
										<Link
											to="/kitchen/$kitchenId/weekly-menus/print/$weeklyMenuId"
											params={{ kitchenId: kitchenIdStr as string, weeklyMenuId: weeklyMenuId as string }}
										>
											<Printer className="size-4 sm:mr-2" />
											<span className="hidden sm:inline">Imprimir</span>
										</Link>
									}
								/>
							}
						></TooltipTrigger>
						<TooltipContent>Imprimir / baixar PDF do cardápio</TooltipContent>
					</Tooltip>
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

			{groupsFailed && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>Grupos do cardápio não carregaram</AlertTitle>
					<AlertDescription>
						As colunas abaixo são as do conjunto padrão, não as de cada refeição: no café e na ceia elas estão erradas, e a preparação que você adicionar entra
						no grupo errado. Recarregue a página antes de mexer no cardápio.
					</AlertDescription>
				</Alert>
			)}

			{willFork && (
				<Alert>
					<GitFork className="size-4" />
					<AlertTitle>Modelo global</AlertTitle>
					<AlertDescription>
						Este plano semanal é do catálogo global da SDAB. Ao salvar, uma cópia local desta cozinha é criada com as suas alterações — o modelo global
						permanece intacto e as demais unidades continuam vendo o original. O salvamento automático fica desligado até lá.
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

				{/* Preenchimento: localizar, quantitativo por refeição e seleção em massa */}
				<div className="flex flex-wrap items-center gap-2">
					<MenuFindBar
						items={items}
						nameOf={(recipeId) => recipeById.get(recipeId)?.name}
						mealTypeOrder={mealTypeIds}
						dayLabel={(day) => WEEKDAYS.find((d) => d.num === day)?.label ?? String(day)}
						mealLabel={(mealTypeId) => mealTypes?.find((m) => m.id === mealTypeId)?.name ?? "Refeição"}
						kitchenId={kitchenId}
						onGoTo={(match) => {
							dispatch({ type: "SET_ACTIVE_TAB", value: String(match.item.day_of_week) })
							setHighlightedKey(match.key)
						}}
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
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setDefaultDemandType(defaultDemandType === "headcount" ? "proportion" : "headcount")}
								/>
							}
						>
							{defaultDemandType === "headcount" ? <Users className="size-4 sm:mr-2" /> : <Percent className="size-4 sm:mr-2" />}
							<span className="hidden sm:inline">{defaultDemandType === "headcount" ? "Pessoas" : "Porcentagem"}</span>
						</TooltipTrigger>
						<TooltipContent>
							Padrão das preparações sem valor: {defaultDemandType === "headcount" ? "número de pessoas" : "% do efetivo"}. Cada uma pode trocar no próprio
							campo.
						</TooltipContent>
					</Tooltip>
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

				{/* Tabs: Visão Geral + dias */}
				<Tabs
					value={activeTab}
					onValueChange={(v) => {
						dispatch({ type: "SET_ACTIVE_TAB", value: v })
						setActiveCell(null)
					}}
				>
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
									meals={meals}
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
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">
										{items.filter((i) => i.day_of_week === day.num).length} receita
										{items.filter((i) => i.day_of_week === day.num).length !== 1 ? "s" : ""}
									</span>
									{clipboard.length > 0 && (
										<Tooltip>
											<TooltipTrigger render={<Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => handlePaste(day.num)} />}>
												<ClipboardPaste className="size-3.5" />
												Colar no dia ({clipboard.length})
											</TooltipTrigger>
											<TooltipContent>Cada preparação volta para a refeição de onde foi copiada.</TooltipContent>
										</Tooltip>
									)}
								</div>
							</div>

							{mealTypes && mealTypes.length > 0 ? (
								mealTypes.map((mealType) => {
									const boardItems = getCellBoardItems(day.num, mealType.id)
									return (
										<Card
											key={mealType.id}
											className="overflow-hidden p-0 gap-0"
											onFocusCapture={() => setActiveCell({ day: day.num, mealTypeId: mealType.id })}
											onMouseDown={() => setActiveCell({ day: day.num, mealTypeId: mealType.id })}
										>
											<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
												<div className="flex items-center gap-2">
													<span className="text-subheading">{mealType.name}</span>
													{boardItems.length > 0 && (
														<Badge variant="secondary" className="text-xs">
															{boardItems.length}
														</Badge>
													)}
												</div>
												<div className="flex items-center gap-2">
													<div
														className="flex items-center gap-1"
														title="Efetivo base previsto desta refeição (comensais). Passa para o cardápio do dia ao aplicar o template."
													>
														<Users className="size-3.5 text-muted-foreground" />
														<Input
															type="number"
															min="1"
															className="h-7 w-20 text-xs"
															placeholder="efetivo"
															value={getMealBase(day.num, mealType.id) ?? ""}
															onChange={(e) => handleMealBaseChange(day.num, mealType.id, e.target.value ? Number.parseInt(e.target.value, 10) : null)}
														/>
													</div>
													{clipboard.length > 0 && (
														<Button
															type="button"
															size="sm"
															variant="ghost"
															className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
															onClick={() => handlePaste(day.num, mealType.id)}
														>
															<ClipboardPaste className="size-3.5" />
															Colar ({clipboard.length})
														</Button>
													)}
													<Button
														type="button"
														size="sm"
														variant="ghost"
														className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
														// Primeira coluna do conjunto DESTA refeição: fixar "prato_principal"
														// criava item fora do conjunto no café e na ceia, numa coluna que
														// nem botão de adicionar tem.
														onClick={() => handleOpenSelector(day.num, mealType.id, groupsFor(mealType.id)[0]?.key ?? null)}
													>
														<Plus className="size-3.5" />
														Adicionar
													</Button>
												</div>
											</div>
											<div className="p-3">
												<MealGroupBoard
													items={boardItems}
													groups={groupsFor(mealType.id)}
													onArrange={(arrangement) => handleArrange(day.num, mealType.id, arrangement)}
													onProportionChange={(recipeId, value) => handleProportionChange(day.num, mealType.id, recipeId, value)}
													onHeadcountChange={(recipeId, value) => handleItemHeadcountChange(day.num, mealType.id, recipeId, value)}
													defaultDemandType={defaultDemandType}
													onCopy={(recipeId) =>
														handleCopyKeys(new Set([menuItemKey({ day_of_week: day.num, meal_type_id: mealType.id, recipe_id: recipeId })]))
													}
													onPaste={() => handlePaste(day.num, mealType.id)}
													canPaste={clipboard.length > 0}
													onRemove={(recipeId) => handleRemoveRecipe(day.num, mealType.id, recipeId)}
													onAdd={(group) => handleOpenSelector(day.num, mealType.id, group)}
													selectionMode={selectionMode}
													selectedIds={
														new Set(
															boardItems
																.map((boardItem) => boardItem.id)
																.filter((recipeId) => selectedKeys.has(menuItemKey({ day_of_week: day.num, meal_type_id: mealType.id, recipe_id: recipeId })))
														)
													}
													onSelectChange={(recipeId, checked) =>
														toggleSelection(menuItemKey({ day_of_week: day.num, meal_type_id: mealType.id, recipe_id: recipeId }), checked)
													}
												/>
											</div>
										</Card>
									)
								})
							) : (
								<div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
									Nenhum tipo de refeição disponível. Configure os tipos de refeição no Agendamento da Produção.
								</div>
							)}
						</TabsContent>
					))}
				</Tabs>
			</div>

			<MenuHeadcountDialog
				open={headcountOpen}
				onOpenChange={setHeadcountOpen}
				mealTypes={mealTypes ?? []}
				scope="meal-base"
				countTargets={(plan, overwrite) => countHeadcountTargets(meals, plan, { days: ALL_WEEKDAYS, overwrite })}
				onApply={handleApplyHeadcountPlan}
			/>

			{selectionMode && selectedKeys.size > 0 && (
				<MenuSelectionBar
					count={selectedKeys.size}
					kitchenId={kitchenId}
					onCopy={() => handleCopyKeys(selectedKeys)}
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
					dispatch({ type: "SET_SELECTED_CELL", value: null })
				}}
				kitchenId={kitchenId}
				selectedRecipeIds={currentCellRecipeIds}
				onSelect={handleSelectRecipes}
				multiSelect
				allowEmpty
				title={
					selectedCell
						? `Preparações de ${mealTypes?.find((m) => m.id === selectedCell.mealTypeId)?.name ?? "refeição"} — ${WEEKDAYS.find((d) => d.num === selectedCell.dayOfWeek)?.label ?? ""}`
						: undefined
				}
				description="Marque o que deve estar nesta refeição: o que já está vem marcado, e desmarcar remove. Nos outros dias escolhidos abaixo, as marcadas são só adicionadas."
				footerSlot={
					selectedCell ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm text-muted-foreground">Adicionar também em:</span>
							{WEEKDAYS.filter((d) => d.num !== selectedCell.dayOfWeek).map((d) => {
								const on = extraDays.has(d.num)
								return (
									<Button
										key={d.num}
										type="button"
										size="sm"
										variant={on ? "default" : "outline"}
										aria-pressed={on}
										onClick={() =>
											setExtraDays((prev) => {
												const nextDays = new Set(prev)
												if (nextDays.has(d.num)) nextDays.delete(d.num)
												else nextDays.add(d.num)
												return nextDays
											})
										}
									>
										{d.abbr}
									</Button>
								)
							})}
						</div>
					) : undefined
				}
			/>
		</div>
	)
}
