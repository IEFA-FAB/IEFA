import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { CheckCircle2, Circle, ClipboardPaste, ListChecks, Loader2, Plus, Printer, Save } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { type BoardArrangement, type BoardItem, MealGroupBoard } from "@/components/features/local/planning/MealGroupBoard"
import { MenuFindBar } from "@/components/features/local/planning/MenuFindBar"
import { MenuSelectionBar } from "@/components/features/local/planning/MenuSelectionBar"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { RecipeVersionBadge, RecipeVersionUpdateButton } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { UnsavedChangesGuard } from "@/components/features/local/planning/UnsavedChangesGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { useMealTypeGroups } from "@/hooks/data/useMenuGroups"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSaveTemplateEdit, useTemplate } from "@/hooks/data/useTemplates"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { cn } from "@/lib/cn"
import { copyMenuItems, type MenuClipboardEntry, menuItemKey, pasteMenuItems, removeMenuItems, replaceMenuRecipe, setItemHeadcount } from "@/lib/menu-fill"
import type { MenuItemGroup } from "@/lib/menu-item-groups"
import { replaceRecipeVersions } from "@/lib/recipe-versions"
import { fetchMealTypesFn } from "@/server/meal-types.fn"
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
 * GLOBAL-03 — Editor de Plano Semanal Modelo (SDAB)
 * URL: /global/weekly-plans/:planId
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/$planId")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: GlobalPlanEditorPage,
	head: () => ({
		meta: [{ title: "Editar Plano Semanal - SISUB" }],
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
				<span className="text-subheading">{day.abbr}</span>
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
										// span, não button: o card do dia inteiro já é um <button>, e button aninhado quebra a hidratação.
										render={<span />}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

function GlobalPlanEditorPage() {
	const { planId } = Route.useParams()
	const navigate = useNavigate()

	const { data: template, isLoading: templateLoading } = useTemplate(planId)

	// Meal types genéricos (kitchen_id = null)
	const { data: mealTypes } = useQuery({
		queryKey: ["meal_types", null],
		queryFn: () => fetchMealTypesFn({ data: { kitchenId: null } }),
		staleTime: 5 * 60 * 1000,
	})

	// Conjunto de grupos de cada refeição genérica: as colunas do board do plano
	// global são as mesmas que a cozinha vai ver depois de adotar o plano.
	const { groupsFor } = useMealTypeGroups(null, mealTypes)

	// Receitas globais (kitchenId=null → tudo com kitchen_id=null)
	const { data: allRecipes } = useRecipes()
	// Tela da SDAB: a edição é do plano GLOBAL mesmo. O contexto é declarado, não inferido.
	const { mutate: saveTemplate, isPending: isSaving } = useSaveTemplateEdit()

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [items, setItems] = useState<TemplateItemDraft[]>([])
	const [initialized, setInitialized] = useState(false)
	const { recipeById, outdated, outdatedById } = useTemplateRecipeVersions(template?.items, allRecipes, items)
	const [activeTab, setActiveTab] = useState("overview")
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [selectionMode, setSelectionMode] = useState(false)
	const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	// Sem auto-save aqui: o plano global só grava no botão Salvar, então a comparação abaixo é
	// a única coisa que impede sair da tela e perder tudo.
	const savedSignatureRef = useRef<string | null>(null)
	// Chave própria, separada da do cardápio da cozinha: colar aqui o que foi copiado lá
	// traria preparação local para dentro de um plano que é da FAB inteira.
	const [clipboard, setClipboard] = usePersistentState<MenuClipboardEntry[]>("sisub:weekly-plan:clipboard", [])
	const [selectedCell, setSelectedCell] = useState<{
		dayOfWeek: number
		mealTypeId: string
		group: MenuItemGroup | null
	} | null>(null)

	if (template && !initialized) {
		setName(template.name ?? "")
		setDescription(template.description ?? "")
		setItems(
			template.items.map((item) => ({
				day_of_week: item.day_of_week ?? 0,
				meal_type_id: item.meal_type_id ?? "",
				recipe_id: item.recipe_id ?? "",
				item_group: (item.item_group as MenuItemGroup | null) ?? null,
				sort_order: item.sort_order ?? 0,
				recommended_proportion: item.recommended_proportion ?? null,
			}))
		)
		setInitialized(true)
	}

	const contentSignature = JSON.stringify({ name: name.trim(), description: description.trim(), items })
	// Lida pelo guarda de saída no momento da navegação, não na renderização.
	const contentSignatureRef = useRef(contentSignature)
	contentSignatureRef.current = contentSignature

	// O conteúdo recém-carregado já está gravado; só o que o usuário mexer conta como pendente.
	useEffect(() => {
		if (!initialized || savedSignatureRef.current !== null) return
		savedSignatureRef.current = contentSignature
	}, [initialized, contentSignature])

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
		setItems(
			items.map((i) => {
				if (i.day_of_week !== dayOfWeek || i.meal_type_id !== mealTypeId) return i
				const next = byRecipe.get(i.recipe_id)
				return next ? { ...i, item_group: next.group, sort_order: next.sortOrder } : i
			})
		)
	}

	/** Atualiza a proporção recomendada de uma preparação da célula. */
	const handleProportionChange = (dayOfWeek: number, mealTypeId: string, recipeId: string, value: number | null) => {
		setItems(
			items.map((i) => (i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, recommended_proportion: value } : i))
		)
	}

	const handleOpenSelector = (dayOfWeek: number, mealTypeId: string, group: MenuItemGroup | null) => {
		setSelectedCell({ dayOfWeek, mealTypeId, group })
		setSelectorOpen(true)
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedCell) return
		const { dayOfWeek, mealTypeId, group } = selectedCell
		// Preserva grupo/ordem/proporção das preparações que permanecem na célula.
		const existingByRecipe = new Map(items.filter((i) => i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId).map((i) => [i.recipe_id, i]))
		const filtered = items.filter((i) => !(i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId))
		let nextInGroup = existingByRecipe.size
		const newItems: TemplateItemDraft[] = recipeIds.map((recipeId) => {
			const existing = existingByRecipe.get(recipeId)
			if (existing) return existing
			return {
				day_of_week: dayOfWeek,
				meal_type_id: mealTypeId,
				recipe_id: recipeId,
				item_group: group,
				sort_order: nextInGroup++,
				recommended_proportion: null,
			}
		})
		setItems([...filtered, ...newItems])
		setSelectedCell(null)
	}

	const handleUpdateVersions = (replacements: Map<string, string>) => {
		setItems(replaceRecipeVersions(items, replacements))
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

	const handleCopyKeys = (keys: ReadonlySet<string>) => {
		const entries = copyMenuItems(items, keys)
		if (entries.length === 0) return
		setClipboard(entries)
		toast.success(`${entries.length} ${entries.length === 1 ? "preparação copiada" : "preparações copiadas"}`)
	}

	const handlePaste = (day: number, mealTypeId?: string) => {
		if (clipboard.length === 0) return
		const result = pasteMenuItems(items, clipboard, { day, mealTypeId }, (draft) => ({
			...draft,
			item_group: draft.item_group as MenuItemGroup | null,
			// O plano global não tem efetivo: comensais colados ficariam invisíveis aqui e ainda
			// assim venceriam a porcentagem em toda cozinha que adotasse o plano.
			headcount_override: null,
		}))
		setItems(result.items)
		if (result.pasted === 0) toast.info("Estas preparações já estão nesta refeição")
		else toast.success(`${result.pasted} ${result.pasted === 1 ? "preparação colada" : "preparações coladas"}`)
	}

	const handleRemoveRecipe = (dayOfWeek: number, mealTypeId: string, recipeId: string) => {
		setItems(items.filter((i) => !(i.day_of_week === dayOfWeek && i.meal_type_id === mealTypeId && i.recipe_id === recipeId)))
	}

	const currentCellRecipeIds = selectedCell
		? items.filter((i) => i.day_of_week === selectedCell.dayOfWeek && i.meal_type_id === selectedCell.mealTypeId).map((i) => i.recipe_id)
		: []

	// Salvar não sai do editor: o plano tem 7 dias em abas e o ajuste raramente termina no
	// primeiro save. `useSaveTemplateEdit` já invalida o template e confirma por toast; o
	// escopo aqui é global sobre um plano global, então a edição é in-place e o id não muda.
	const handleSave = () => {
		if (!name.trim()) return
		const signatureAtSave = contentSignature
		saveTemplate(
			{
				id: planId,
				context: { scope: "global" },
				updates: {
					name: name.trim(),
					description: description.trim() || null,
				},
				items: items.map((i) => ({
					day_of_week: i.day_of_week,
					meal_type_id: i.meal_type_id,
					recipe_id: i.recipe_id,
					item_group: i.item_group ?? null,
					sort_order: i.sort_order ?? 0,
					recommended_proportion: i.recommended_proportion ?? null,
				})),
			},
			{
				onSuccess: () => {
					savedSignatureRef.current = signatureAtSave
				},
			}
		)
	}

	const recipeMap = new Map([...recipeById].map(([id, r]) => [id, r.name]))
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
				<p className="text-subheading">Plano semanal não encontrado.</p>
				<Link to="/global/weekly-plans" className="cursor-pointer text-sm text-primary mt-2 flex items-center justify-center hover:underline">
					← Voltar para listagem
				</Link>
			</div>
		)
	}

	return (
		<TooltipProvider>
			<div className="space-y-6">
				<PageHeader title="Editar Plano Semanal Modelo" onBack={() => navigate({ to: "/global/weekly-plans" })}>
					<div className="flex items-center gap-2">
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
											<Link to="/global/weekly-plans/print/$planId" params={{ planId }}>
												<Printer className="size-4 sm:mr-2" />
												<span className="hidden sm:inline">Imprimir</span>
											</Link>
										}
									/>
								}
							></TooltipTrigger>
							<TooltipContent>Imprimir / baixar PDF do plano</TooltipContent>
						</Tooltip>
						<Button nativeButton={false} type="button" variant="outline" size="sm" render={<Link to="/global/weekly-plans">Cancelar</Link>} />
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
									<Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cardápio Padrão FAB — Semana 1" required />
								</Field>
								<Field>
									<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
									<Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição do plano" />
								</Field>
							</FieldGroup>
							<div className="mt-4 flex items-center gap-2">
								<Badge variant="outline" className="text-xs">
									Global · SDAB
								</Badge>
								<span className="text-xs text-muted-foreground">Disponível para fork por todas as cozinhas</span>
							</div>
						</CardContent>
					</Card>

					{/* Preenchimento: localizar e seleção em massa. Sem quantitativo: o plano global não
					    carrega efetivo — cada unidade informa o dela no cardápio da cozinha. */}
					<div className="flex flex-wrap items-center gap-2">
						<MenuFindBar
							items={items}
							nameOf={(recipeId) => recipeById.get(recipeId)?.name}
							mealTypeOrder={(mealTypes ?? []).map((m) => m.id)}
							dayLabel={(day) => WEEKDAYS.find((d) => d.num === day)?.label ?? String(day)}
							mealLabel={(mealTypeId) => mealTypes?.find((m) => m.id === mealTypeId)?.name ?? "Refeição"}
							kitchenId={null}
							onGoTo={(match) => {
								setActiveTab(String(match.item.day_of_week))
								setHighlightedKey(match.key)
							}}
							onReplaceAll={(keys, recipeId) => setItems(replaceMenuRecipe(items, keys, recipeId))}
							onSelectMatches={(keys) => {
								setSelectionMode(true)
								setSelectedKeys(keys)
							}}
						/>
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
									<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "preparação" : "preparações"} no plano
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
									<p className="text-sm text-muted-foreground mb-1">Plano vazio — nenhuma preparação atribuída ainda.</p>
									<p className="text-xs text-muted-foreground/60">Clique em um dia acima ou use as abas para começar.</p>
								</div>
							)}
						</TabsContent>

						{WEEKDAYS.map((day) => (
							<TabsContent key={day.num} value={String(day.num)} className="mt-4 space-y-3">
								<div className="flex items-center justify-between px-1">
									<h2 className="text-subheading">{day.label}</h2>
									<span className="text-xs text-muted-foreground">
										{items.filter((i) => i.day_of_week === day.num).length} preparaç
										{items.filter((i) => i.day_of_week === day.num).length !== 1 ? "ões" : "ão"}
									</span>
								</div>

								{mealTypes && mealTypes.length > 0 ? (
									mealTypes.map((mealType) => {
										const boardItems = getCellBoardItems(day.num, mealType.id)
										return (
											<Card key={mealType.id} className="overflow-hidden p-0 gap-0">
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
															onClick={() => handleOpenSelector(day.num, mealType.id, "prato_principal")}
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
														onRemove={(recipeId) => handleRemoveRecipe(day.num, mealType.id, recipeId)}
														onAdd={(group) => handleOpenSelector(day.num, mealType.id, group)}
														// Plano global não carrega efetivo: a demanda aqui só pode ser dita em % da refeição,
														// e a cozinha que adotar o plano informa o efetivo dela.
														allowHeadcount={false}
														onCopy={(recipeId) =>
															handleCopyKeys(new Set([menuItemKey({ day_of_week: day.num, meal_type_id: mealType.id, recipe_id: recipeId })]))
														}
														onPaste={() => handlePaste(day.num, mealType.id)}
														canPaste={clipboard.length > 0}
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
										Nenhum tipo de refeição genérico cadastrado. Configure os tipos de refeição no módulo Gestão.
									</div>
								)}
							</TabsContent>
						))}
					</Tabs>
				</div>

				{selectionMode && selectedKeys.size > 0 && (
					<MenuSelectionBar
						count={selectedKeys.size}
						kitchenId={null}
						onCopy={() => handleCopyKeys(selectedKeys)}
						allowHeadcount={false}
						onSetHeadcount={(headcount) => setItems(setItemHeadcount(items, selectedKeys, headcount))}
						onReplace={(recipeId) => {
							setItems(replaceMenuRecipe(items, selectedKeys, recipeId))
							clearSelection()
						}}
						onRemove={() => {
							setItems(removeMenuItems(items, selectedKeys))
							clearSelection()
						}}
						onClear={clearSelection}
					/>
				)}

				<UnsavedChangesGuard isDirty={() => savedSignatureRef.current !== null && contentSignatureRef.current !== savedSignatureRef.current} />

				{/* RecipeSelector — kitchenId=null filtra apenas preparações globais */}
				<RecipeSelector
					open={selectorOpen}
					onClose={() => {
						setSelectorOpen(false)
						setSelectedCell(null)
					}}
					kitchenId={null}
					selectedRecipeIds={currentCellRecipeIds}
					onSelect={handleSelectRecipes}
					multiSelect
				/>
			</div>
		</TooltipProvider>
	)
}
