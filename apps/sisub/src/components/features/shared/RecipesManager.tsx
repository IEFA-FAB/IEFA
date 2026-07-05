// biome-ignore-all lint/a11y/useSemanticElements: virtualized recipe rows contain nested action links.
import type { Recipe } from "@iefa/database/sisub"
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownAZ, ArrowDownZA, CalendarCheck, ChefHat, GitFork, Globe, Loader2, Replace, Search, SlidersHorizontal, SquareCheckBig, X } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { BulkSelectedRecipe } from "@/hooks/business/useBulkRecipeOps"
import { useRecipe } from "@/hooks/data/useRecipe"
import { useRecipeLastReviews, useRecipeMenuUsage, useRecipes } from "@/hooks/data/useRecipes"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { getStoredScrollOffset, usePersistScrollOffset } from "@/hooks/ui/useScrollRestoration"
import type { RecipeWithIngredients } from "@/types/domain/recipes"
import { RecipesBulkActionsBar } from "./RecipesBulkActionsBar"
import { RecipesFindReplaceDialog } from "./RecipesFindReplaceDialog"

const ROW_HEIGHT = 48

function formatQty(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/** Formata a data ISO da revisão como "09/06/2026" (curto, pt-BR). Espelha a árvore de insumos. */
function formatReviewDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Conteúdo do hovercard de uma preparação: prévia dos ingredientes principais (montado só ao abrir → fetch sob demanda) */
function RecipeHoverContent({ recipe }: { recipe: Recipe }) {
	const isGlobal = !recipe.kitchen_id
	const { data, isLoading } = useRecipe(recipe.id)
	const detail = data as RecipeWithIngredients | undefined

	// Ingredientes ordenados por prioridade; obrigatórios primeiro.
	const ingredients = (detail?.ingredients ?? [])
		.filter((ri) => !ri.deleted_at)
		.sort((a, b) => Number(a.is_optional ?? false) - Number(b.is_optional ?? false) || (a.priority_order ?? 999) - (b.priority_order ?? 999))

	const preview = ingredients.slice(0, 7)
	const extra = ingredients.length - preview.length

	return (
		<>
			<div className="flex items-start gap-2">
				<div
					className={`flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] border ${
						isGlobal ? "border-primary/20 bg-primary/10" : "border-border/30 bg-muted/50"
					}`}
				>
					{isGlobal ? <Globe className="size-3.5 text-primary" /> : <ChefHat className="size-3.5 text-muted-foreground" />}
				</div>
				<div className="min-w-0">
					<p className="text-sm font-semibold leading-tight">{recipe.name}</p>
					<p className="text-xs text-muted-foreground">Ingredientes{recipe.portion_yield != null ? ` · ${recipe.portion_yield} porções` : ""}</p>
				</div>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					Carregando ingredientes…
				</div>
			) : preview.length === 0 ? (
				<p className="py-1 text-xs text-muted-foreground">Sem ingredientes cadastrados.</p>
			) : (
				<div className="flex flex-col gap-1 text-xs">
					{preview.map((ri) => (
						<div key={ri.id} className="flex items-baseline justify-between gap-3">
							<span className="truncate text-muted-foreground">
								{ri.ingredient?.description ?? "Ingrediente"}
								{ri.is_optional && <span className="text-[10px] uppercase tracking-wide"> · opc</span>}
							</span>
							{ri.net_quantity != null && (
								<span className="shrink-0 font-mono tabular-nums">
									{formatQty(ri.net_quantity)}
									{ri.ingredient?.measure_unit ? ` ${ri.ingredient.measure_unit}` : ""}
								</span>
							)}
						</div>
					))}
					{extra > 0 && <p className="pt-0.5 text-[11px] text-muted-foreground">+{extra} outros ingredientes</p>}
				</div>
			)}
		</>
	)
}

export function RecipesManager() {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null
	const kitchenIdNum = kitchenIdStr ? Number(kitchenIdStr) : null
	const scrollKey = `sisub:recipes:${kitchenIdStr ?? "global"}:scroll`

	const { search: urlSearch = "", type = "all" } = useSearch({ strict: false }) as {
		search?: string
		type?: "all" | "global" | "local"
	}
	const navigate = useNavigate()
	const navigateRef = useRef(navigate)
	navigateRef.current = navigate

	const [inputValue, setInputValue] = useState(urlSearch)
	const isFirstRender = useRef(true)

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		const timer = setTimeout(() => {
			// biome-ignore lint/suspicious/noExplicitAny: shared component, navigate has no from context
			navigateRef.current({ search: { search: inputValue || undefined, type: type === "all" ? undefined : type } as any, replace: true })
		}, 400)
		return () => clearTimeout(timer)
	}, [inputValue, type])

	const parentRef = useRef<HTMLDivElement>(null)

	// Sensibilidade da busca (persistida por aba). Default: insensível a ambos.
	const [searchCaseSensitive, setSearchCaseSensitive] = usePersistentState("sisub:recipes:search:caseSensitive", false)
	const [searchAccentSensitive, setSearchAccentSensitive] = usePersistentState("sisub:recipes:search:accentSensitive", false)

	// Ordenação alfabética (A-Z / Z-A). Persistida por aba.
	const [sortDirection, setSortDirection] = usePersistentState<"asc" | "desc">("sisub:recipes:sort", "asc")

	// Seleção em massa
	const [selectionMode, setSelectionMode] = useState(false)
	const [showDeleted, setShowDeleted] = usePersistentState(`sisub:recipes:${kitchenIdStr ?? "global"}:showDeleted`, false)
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	// Filtro: mostrar apenas preparações usadas em algum plano semanal.
	const [onlyWeeklyMenu, setOnlyWeeklyMenu] = usePersistentState(`sisub:recipes:${kitchenIdStr ?? "global"}:onlyWeeklyMenu`, false)
	// Filtro: mostrar apenas preparações ainda não revisadas (conferência pendente).
	const [onlyNotReviewed, setOnlyNotReviewed] = usePersistentState(`sisub:recipes:${kitchenIdStr ?? "global"}:onlyNotReviewed`, false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedRecipe>>(new Map())
	const selectedRecipes = useMemo(() => Array.from(selected.values()), [selected])
	const showDeletedId = useId()
	const searchCaseId = useId()
	const searchAccentId = useId()
	const onlyWeeklyMenuId = useId()
	const onlyNotReviewedId = useId()

	const { data: allRecipes = [], isLoading } = useRecipes({
		search: urlSearch || undefined,
		origin: type,
		includeDeleted: showDeleted,
		caseSensitive: searchCaseSensitive,
		accentSensitive: searchAccentSensitive,
		sortDirection,
	})

	// Preparações usadas em planos semanais → revisão prioritária pelas nutricionistas.
	const { usedIds: menuUsageIds } = useRecipeMenuUsage()
	// Status de revisão (conferência) por preparação — para o badge por linha e o filtro de pendentes.
	const { reviewedAtById } = useRecipeLastReviews()

	const filteredRecipes = useMemo(() => {
		let list = allRecipes
		if (onlyWeeklyMenu) list = list.filter((r) => menuUsageIds.has(r.id))
		if (onlyNotReviewed) list = list.filter((r) => !reviewedAtById.has(r.id))
		return list
	}, [allRecipes, onlyWeeklyMenu, onlyNotReviewed, menuUsageIds, reviewedAtById])

	const clearSelection = () => setSelected(new Map())

	const exitSelectionMode = () => {
		setSelectionMode(false)
		clearSelection()
	}

	const toggleSelect = (recipe: (typeof filteredRecipes)[number], checked: boolean) => {
		setSelected((prev) => {
			const next = new Map(prev)
			if (checked) next.set(recipe.id, { id: recipe.id, name: recipe.name, kitchenId: recipe.kitchen_id, data: recipe })
			else next.delete(recipe.id)
			return next
		})
	}

	const selectAllVisible = () => {
		setSelected((prev) => {
			const next = new Map(prev)
			for (const r of filteredRecipes) next.set(r.id, { id: r.id, name: r.name, kitchenId: r.kitchen_id, data: r })
			return next
		})
	}

	const stats = useMemo(() => {
		const total = filteredRecipes.length
		const global = filteredRecipes.filter((r) => !r.kitchen_id).length
		return { total, global, local: total - global }
	}, [filteredRecipes])

	function setOrigin(value: "all" | "global" | "local") {
		// biome-ignore lint/suspicious/noExplicitAny: shared component, navigate has no from context
		navigate({ search: { search: urlSearch || undefined, type: value === "all" ? undefined : value } as any, replace: true })
	}

	function navigateToRecipe(recipeId: string) {
		if (kitchenId) {
			navigate({ to: "/kitchen/$kitchenId/recipes/$recipeId", params: { kitchenId, recipeId } })
		} else {
			navigate({ to: "/global/recipes/$recipeId", params: { recipeId } })
		}
	}

	const virtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		getItemKey: (index) => filteredRecipes[index]?.id ?? index,
		// Restaura o offset salvo ao remontar (ex: voltar de uma página de detalhe).
		initialOffset: () => getStoredScrollOffset(scrollKey),
	})

	// Persiste o offset de scroll continuamente.
	usePersistScrollOffset(scrollKey, parentRef, !isLoading && filteredRecipes.length > 0)

	return (
		<div className="space-y-6">
			{/* Search & Filters */}
			<Card className="flex-col lg:flex-row lg:items-center gap-3 p-4 overflow-visible">
				{/* Busca + opções de busca (esquerda, cresce até preencher) */}
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<div className="relative flex-1 min-w-56">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input placeholder="Buscar Preparação..." className="pl-10" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
					</div>

					<Popover>
						<PopoverTrigger render={<Button variant="outline" size="sm" className="shrink-0 gap-2" aria-label="Opções de busca" />}>
							<SlidersHorizontal className="size-4" />
							<span className="hidden sm:inline">Opções</span>
							{(searchCaseSensitive || searchAccentSensitive || showDeleted || onlyWeeklyMenu || onlyNotReviewed) && (
								<span className="size-1.5 rounded-full bg-primary" aria-hidden />
							)}
						</PopoverTrigger>
						<PopoverContent align="start" className="w-64">
							<div className="flex flex-col gap-3 text-sm">
								<label htmlFor={searchCaseId} className="flex items-center justify-between gap-3 cursor-pointer select-none">
									Diferenciar maiúsculas
									<Switch id={searchCaseId} checked={searchCaseSensitive} onCheckedChange={setSearchCaseSensitive} size="sm" />
								</label>
								<label htmlFor={searchAccentId} className="flex items-center justify-between gap-3 cursor-pointer select-none">
									Diferenciar acentos
									<Switch id={searchAccentId} checked={searchAccentSensitive} onCheckedChange={setSearchAccentSensitive} size="sm" />
								</label>
								<label htmlFor={showDeletedId} className="flex items-center justify-between gap-3 cursor-pointer select-none">
									Mostrar excluídas
									<Switch id={showDeletedId} checked={showDeleted} onCheckedChange={setShowDeleted} size="sm" />
								</label>
								<label htmlFor={onlyWeeklyMenuId} className="flex items-center justify-between gap-3 cursor-pointer select-none">
									Apenas em plano semanal
									<Switch id={onlyWeeklyMenuId} checked={onlyWeeklyMenu} onCheckedChange={setOnlyWeeklyMenu} size="sm" />
								</label>
								<label htmlFor={onlyNotReviewedId} className="flex items-center justify-between gap-3 cursor-pointer select-none">
									Somente não revisadas
									<Switch id={onlyNotReviewedId} checked={onlyNotReviewed} onCheckedChange={setOnlyNotReviewed} size="sm" />
								</label>
							</div>
						</PopoverContent>
					</Popover>
				</div>

				{/* Filtro de origem + ações (direita) */}
				<div className="flex flex-wrap items-center gap-2 lg:justify-end">
					{selectionMode ? (
						<>
							<Button variant="outline" size="sm" onClick={selectAllVisible} aria-label="Selecionar todas as visíveis">
								Selecionar Visíveis
							</Button>
							<Button variant="outline" size="sm" onClick={exitSelectionMode} aria-label="Sair do modo de seleção">
								<X className="size-4 mr-2" />
								Concluir Seleção
							</Button>
						</>
					) : (
						<>
							<ButtonGroup>
								<Button variant={type === "all" ? "secondary" : "ghost"} onClick={() => setOrigin("all")} size="sm">
									Todas
								</Button>
								<Button variant={type === "global" ? "secondary" : "ghost"} onClick={() => setOrigin("global")} size="sm">
									Globais (SDAB)
								</Button>
								<Button variant={type === "local" ? "secondary" : "ghost"} onClick={() => setOrigin("local")} size="sm">
									Locais
								</Button>
							</ButtonGroup>

							<Button
								variant="outline"
								size="sm"
								onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
								aria-label={sortDirection === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"}
							>
								{sortDirection === "asc" ? <ArrowDownAZ className="size-4 mr-2" /> : <ArrowDownZA className="size-4 mr-2" />}
								<span className="hidden sm:inline">{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
							</Button>

							<Button variant="outline" size="sm" onClick={() => setFindReplaceOpen(true)} aria-label="Localizar e substituir">
								<Replace className="size-4 mr-2" />
								<span className="hidden sm:inline">Localizar e Substituir</span>
								<span className="sm:hidden">Substituir</span>
							</Button>
							<Button variant="outline" size="sm" onClick={() => setSelectionMode(true)} aria-label="Selecionar itens">
								<SquareCheckBig className="size-4 mr-2" />
								<span className="hidden sm:inline">Selecionar Itens</span>
								<span className="sm:hidden">Selecionar</span>
							</Button>
						</>
					)}
				</div>
			</Card>

			{/* Virtualized List */}
			<Card>
				<div ref={parentRef} className="h-150 overflow-auto">
					{isLoading ? (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Carregando preparações...</div>
					) : filteredRecipes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">Nenhuma preparação encontrada</p>
							{onlyNotReviewed ? (
								<p className="text-sm mt-2">Nenhuma preparação pendente de revisão neste filtro</p>
							) : onlyWeeklyMenu ? (
								<p className="text-sm mt-2">Nenhuma preparação em plano semanal — ajuste o filtro em Opções</p>
							) : (
								urlSearch && <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>
							)}
						</div>
					) : (
						<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
							{virtualizer.getVirtualItems().map((vRow) => {
								const recipe = filteredRecipes[vRow.index]
								const isSelected = selected.has(recipe.id)
								const isDeleted = !!recipe.deleted_at
								const reviewedAt = reviewedAtById.get(recipe.id)
								return (
									<div
										key={vRow.key}
										className={`flex items-center justify-between px-4 border-b border-border/30 hover:bg-muted/50 transition-colors cursor-pointer absolute ${
											isSelected ? "bg-primary/5" : ""
										}`}
										style={{
											top: 0,
											left: 0,
											width: "100%",
											height: `${vRow.size}px`,
											transform: `translateY(${vRow.start}px)`,
										}}
										onClick={() => (selectionMode ? toggleSelect(recipe, !isSelected) : navigateToRecipe(recipe.id))}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault()
												if (selectionMode) toggleSelect(recipe, !isSelected)
												else navigateToRecipe(recipe.id)
											}
										}}
										role="button"
										tabIndex={0}
										aria-pressed={selectionMode ? isSelected : undefined}
									>
										<div className="flex items-center gap-3 flex-1 min-w-0">
											{selectionMode && (
												<Checkbox
													checked={isSelected}
													onCheckedChange={(checked) => toggleSelect(recipe, checked === true)}
													onClick={(e) => e.stopPropagation()}
													aria-label={`Selecionar ${recipe.name}`}
												/>
											)}
											<div
												className={`flex items-center justify-center size-7 rounded-[var(--radius)] border shrink-0 ${
													recipe.kitchen_id ? "bg-muted/50 border-border/30" : "bg-primary/10 border-primary/20"
												}`}
											>
												{recipe.kitchen_id ? <ChefHat className="size-3.5 text-muted-foreground" /> : <Globe className="size-3.5 text-primary" />}
											</div>
											<HoverCard>
												<HoverCardTrigger
													render={
														<span className={`text-subheading truncate cursor-default ${isDeleted ? "line-through text-muted-foreground" : ""}`}>
															{recipe.name}
														</span>
													}
												/>
												<HoverCardContent side="right" align="start">
													<RecipeHoverContent recipe={recipe} />
												</HoverCardContent>
											</HoverCard>
											{isDeleted && <Badge variant="destructive">Excluída</Badge>}
											{menuUsageIds.has(recipe.id) && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Badge variant="accent" className="shrink-0">
																<CalendarCheck />
																<span className="hidden sm:inline">Plano semanal</span>
															</Badge>
														}
													/>
													<TooltipContent>Usada em plano semanal — priorize a revisão</TooltipContent>
												</Tooltip>
											)}
											{!isDeleted &&
												(reviewedAt ? (
													<Badge variant="outline" className="gap-1 text-muted-foreground shrink-0" title={`Última revisão em ${formatReviewDate(reviewedAt)}`}>
														<CalendarCheck className="size-3" />
														<span className="hidden sm:inline">Revisada {formatReviewDate(reviewedAt)}</span>
													</Badge>
												) : (
													<Badge variant="warning" className="shrink-0" title="Preparação ainda não revisada">
														Não revisada
													</Badge>
												))}
											{recipe.version > 1 && (
												<Badge variant="secondary" className="rounded-full px-2 py-0 font-mono text-xs shrink-0">
													v{recipe.version}
												</Badge>
											)}
											{recipe.base_recipe_id && (
												<Badge variant="outline" className="text-xs shrink-0">
													Fork
												</Badge>
											)}
										</div>

										<div className="flex items-center gap-3 shrink-0 ml-3">
											{recipe.portion_yield != null && <span className="text-sm text-muted-foreground font-mono">{recipe.portion_yield} porções</span>}
											{!selectionMode && !recipe.kitchen_id && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																variant="ghost"
																size="icon-xs"
																nativeButton={false}
																className="hover:bg-accent/10 transition-all"
																render={
																	kitchenId ? (
																		<Link
																			to="/kitchen/$kitchenId/recipes/new"
																			params={{ kitchenId }}
																			search={{ forkFrom: recipe.id }}
																			onClick={(e) => e.stopPropagation()}
																		>
																			<GitFork className="size-3.5" />
																		</Link>
																	) : (
																		<Link to="/global/recipes/new" search={{ forkFrom: recipe.id }} onClick={(e) => e.stopPropagation()}>
																			<GitFork className="size-3.5" />
																		</Link>
																	)
																}
															/>
														}
													/>
													<TooltipContent>Criar cópia local</TooltipContent>
												</Tooltip>
											)}
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>
				<CardFooter className="gap-3 text-xs text-muted-foreground select-none">
					<span>
						{stats.total} {stats.total === 1 ? "preparação" : "preparações"}
					</span>
					{type === "all" && stats.total > 0 && (
						<>
							<span aria-hidden>·</span>
							<span>
								{stats.global} {stats.global === 1 ? "global" : "globais"}
							</span>
							<span aria-hidden>·</span>
							<span>
								{stats.local} {stats.local === 1 ? "local" : "locais"}
							</span>
						</>
					)}
				</CardFooter>
			</Card>

			{/* Localizar e substituir */}
			<RecipesFindReplaceDialog isOpen={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} kitchenId={kitchenIdNum} />

			{/* Barra de ações em massa */}
			{selectionMode && selectedRecipes.length > 0 && (
				<RecipesBulkActionsBar
					selectedRecipes={selectedRecipes}
					kitchenId={kitchenIdNum}
					showDeleted={showDeleted}
					onClear={clearSelection}
					onDone={clearSelection}
				/>
			)}
		</div>
	)
}
