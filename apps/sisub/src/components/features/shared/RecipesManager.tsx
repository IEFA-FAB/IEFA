// biome-ignore-all lint/a11y/useSemanticElements: virtualized recipe rows contain nested action links.
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChefHat, GitFork, Globe, Replace, Search, SquareCheckBig, X } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { BulkSelectedRecipe } from "@/hooks/business/useBulkRecipeOps"
import { useRecipes } from "@/hooks/data/useRecipes"
import { RecipesBulkActionsBar } from "./RecipesBulkActionsBar"
import { RecipesFindReplaceDialog } from "./RecipesFindReplaceDialog"

const ROW_HEIGHT = 48

export function RecipesManager() {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null
	const kitchenIdNum = kitchenIdStr ? Number(kitchenIdStr) : null

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

	// Seleção em massa
	const [selectionMode, setSelectionMode] = useState(false)
	const [showDeleted, setShowDeleted] = useState(false)
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedRecipe>>(new Map())
	const selectedRecipes = useMemo(() => Array.from(selected.values()), [selected])
	const showDeletedId = useId()

	const { data: filteredRecipes = [], isLoading } = useRecipes({
		search: urlSearch || undefined,
		origin: type,
		includeDeleted: showDeleted,
	})

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
	})

	return (
		<div className="space-y-6">
			{/* Search & Filters */}
			<Card className="flex-col sm:flex-row items-stretch sm:items-center gap-4 p-5 overflow-visible">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input placeholder="Buscar Preparação..." className="pl-10" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
				</div>
				<div className="flex flex-wrap items-center gap-2">
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
							<Button variant={type === "all" ? "secondary" : "ghost"} onClick={() => setOrigin("all")} size="sm">
								Todas
							</Button>
							<Button variant={type === "global" ? "secondary" : "ghost"} onClick={() => setOrigin("global")} size="sm">
								Globais (SDAB)
							</Button>
							<Button variant={type === "local" ? "secondary" : "ghost"} onClick={() => setOrigin("local")} size="sm">
								Locais
							</Button>

							<label htmlFor={showDeletedId} className="flex items-center gap-2 text-sm cursor-pointer select-none ml-2">
								<Switch id={showDeletedId} checked={showDeleted} onCheckedChange={setShowDeleted} size="sm" />
								Mostrar excluídas
							</label>

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
							{urlSearch && <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>}
						</div>
					) : (
						<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
							{virtualizer.getVirtualItems().map((vRow) => {
								const recipe = filteredRecipes[vRow.index]
								const isSelected = selected.has(recipe.id)
								const isDeleted = !!recipe.deleted_at
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
											<span className={`text-subheading truncate ${isDeleted ? "line-through text-muted-foreground" : ""}`}>{recipe.name}</span>
											{isDeleted && <Badge variant="destructive">Excluída</Badge>}
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
