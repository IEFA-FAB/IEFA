import type { Recipe } from "@iefa/database/sisub"
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
	ArrowDownAZ,
	ArrowDownZA,
	CalendarCheck,
	ChefHat,
	Folder as FolderIcon,
	GitFork,
	Globe,
	Loader2,
	Replace,
	Search,
	SlidersHorizontal,
	SquareCheckBig,
	X,
} from "lucide-react"
import { type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardFooter } from "@/components/ui/card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TREE_LEAF_TONE, TREE_MUTED_TONE, TreeRow, treeFolderTone } from "@/components/ui/tree-row"
import type { BulkSelectedRecipe } from "@/hooks/business/useBulkRecipeOps"
import { useRecipe } from "@/hooks/data/useRecipe"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"
import { useRecipeLastReviews, useRecipeMenuUsage, useRecipes } from "@/hooks/data/useRecipes"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { getStoredScrollOffset, usePersistScrollOffset } from "@/hooks/ui/useScrollRestoration"
import { cn } from "@/lib/cn"
import { allRecipeFolderIds, buildRecipeTree } from "@/lib/recipe-tree"
import type { RecipeWithIngredients } from "@/types/domain/recipes"
import { RecipeFoldersDialog } from "./RecipeFoldersDialog"
import { RecipesBulkActionsBar } from "./RecipesBulkActionsBar"
import { RecipesFindReplaceDialog } from "./RecipesFindReplaceDialog"

const ROW_HEIGHT = 48

/** Ações do catálogo de pastas ficam no PageHeader da rota, como em `IngredientsTreeManager`. */
export type RecipesManagerHandle = { openFoldersDialog: () => void }

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

/**
 * Listagem de preparações — MESMA navegação da árvore de insumos.
 *
 * A pasta era só um filtro num `<Select>`: para saber o que estava em cada uma, era
 * preciso trocar o filtro N vezes, e o agrupamento não aparecia em lugar nenhum. Agora
 * ela é a estrutura da listagem (`lib/recipe-tree`), com o mesmo nó de linha
 * (`ui/tree-row`), o mesmo par Expandir/Recolher e a mesma barra de busca dos insumos.
 *
 * O catálogo de pastas continua PLANO no banco (`recipe_folder` não tem `parent_id`),
 * então a árvore tem dois níveis; a diferença é de dados, não de interface.
 */
export function RecipesManager({ ref }: { ref?: Ref<RecipesManagerHandle> }) {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null
	const kitchenIdNum = kitchenIdStr ? Number(kitchenIdStr) : null
	const persistKey = `sisub:recipes:${kitchenIdStr ?? "global"}`
	const scrollKey = `${persistKey}:scroll`

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
	const [showDeleted, setShowDeleted] = usePersistentState(`${persistKey}:showDeleted`, false)
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	// Filtro: mostrar apenas preparações usadas em algum plano semanal.
	const [onlyWeeklyMenu, setOnlyWeeklyMenu] = usePersistentState(`${persistKey}:onlyWeeklyMenu`, false)
	// Filtro: mostrar apenas preparações ainda não revisadas (conferência pendente).
	const [onlyNotReviewed, setOnlyNotReviewed] = usePersistentState(`${persistKey}:onlyNotReviewed`, false)
	const [foldersDialogOpen, setFoldersDialogOpen] = useState(false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedRecipe>>(new Map())
	const selectedRecipes = useMemo(() => Array.from(selected.values()), [selected])
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
	const { reviewedAtById, isLoading: reviewsLoading } = useRecipeLastReviews()
	// Pastas — o agrupamento que estrutura a listagem.
	const { folders, isLoading: foldersLoading } = useRecipeFolders()

	useImperativeHandle(ref, () => ({ openFoldersDialog: () => setFoldersDialogOpen(true) }), [])

	const filteredRecipes = useMemo(() => {
		let list = allRecipes
		if (onlyWeeklyMenu) list = list.filter((r) => menuUsageIds.has(r.id))
		// Só filtra por revisão quando o mapa já chegou — com o Map ainda vazio, `!has` seria
		// verdadeiro para todas e a lista completa apareceria antes de sumir (flash). O gate de
		// loading abaixo mostra o spinner nesse meio-tempo.
		if (onlyNotReviewed && !reviewsLoading) list = list.filter((r) => !reviewedAtById.has(r.id))
		return list
	}, [allRecipes, onlyWeeklyMenu, onlyNotReviewed, reviewsLoading, menuUsageIds, reviewedAtById])

	// Estado de expand/collapse das pastas, persistido por aba (preserva o que estava aberto
	// ao entrar numa preparação e voltar).
	const [expandedIds, setExpandedIds, expandMeta] = usePersistentState<Set<string>>(`${persistKey}:expanded`, new Set(), {
		serialize: (s) => JSON.stringify([...s]),
		deserialize: (raw) => new Set(JSON.parse(raw) as string[]),
	})
	const initializedRef = useRef(false)

	// Default: tudo ABERTO — o oposto da árvore de insumos, de propósito. Lá a hierarquia é
	// profunda e tem milhares de nós; aqui são dois níveis, e a maioria das preparações costuma
	// estar sem pasta — abrir recolhido devolveria uma tela quase vazia onde antes havia lista.
	useEffect(() => {
		if (!expandMeta.hydrated || foldersLoading || initializedRef.current) return
		initializedRef.current = true
		if (expandMeta.hadStored) return
		setExpandedIds(allRecipeFolderIds(folders))
	}, [expandMeta.hydrated, expandMeta.hadStored, foldersLoading, folders, setExpandedIds])

	const toggleExpand = (folderId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(folderId)) next.delete(folderId)
			else next.add(folderId)
			return next
		})
	}
	const expandAll = () => setExpandedIds(allRecipeFolderIds(folders))
	const collapseAll = () => setExpandedIds(new Set())

	// Com filtro ativo, a árvore abre sozinha e pasta sem resultado some (igual aos insumos).
	const isFiltering = !!urlSearch || onlyWeeklyMenu || onlyNotReviewed

	const tree = useMemo(
		() => buildRecipeTree({ folders, recipes: filteredRecipes, sortDirection, expandedIds, isFiltering }),
		[folders, filteredRecipes, sortDirection, expandedIds, isFiltering]
	)

	// Enquanto o filtro de pendentes está ativo e o mapa de revisões carrega (1ª visita, sem
	// cache), exibe loading em vez de uma lista transitoriamente incorreta.
	const showLoading = isLoading || (onlyNotReviewed && reviewsLoading)

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

	// "Visíveis" = o que está renderizado na árvore. Preparação dentro de pasta recolhida
	// fica de fora — a ação em massa nunca deve alcançar o que a tela não mostra.
	const selectAllVisible = () => {
		setSelected((prev) => {
			const next = new Map(prev)
			for (const node of tree.nodes) {
				if (node.type !== "recipe") continue
				const r = node.data
				next.set(r.id, { id: r.id, name: r.name, kitchenId: r.kitchen_id, data: r })
			}
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
		count: tree.nodes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		getItemKey: (index) => tree.nodes[index]?.id ?? index,
		// Restaura o offset salvo ao remontar (ex: voltar de uma página de detalhe).
		initialOffset: () => getStoredScrollOffset(scrollKey),
	})

	// Persiste o offset de scroll continuamente.
	usePersistScrollOffset(scrollKey, parentRef, !isLoading && tree.nodes.length > 0)

	return (
		<div className="space-y-6">
			{/* Toolbar. Só vira uma linha quando as duas metades cabem de fato: busca (~320px)
			    + as quatro ações (~700px). Com a sidebar fixa isso acontece por volta de 1400px
			    de viewport — em `lg` (1024) a busca era espremida a 215px e o placeholder cortava. */}
			<Card className="flex-col min-[1400px]:flex-row min-[1400px]:items-center gap-3 p-4 overflow-visible">
				{/* Busca + opções de busca (esquerda). No modo linha, `basis-80 min-w-80` reserva o
				    par campo+Opções: sem piso, o flex encolhia este bloco e o botão saía por baixo
				    das ações. As três utilidades ficam no breakpoint porque `basis` no eixo coluna
				    vira ALTURA — solto, inflava o card em 320px. */}
				<div className="flex items-center gap-2 min-[1400px]:flex-1 min-[1400px]:basis-80 min-[1400px]:min-w-80">
					<div className="relative flex-1 min-w-56">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Buscar pastas ou preparações..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							className="pl-10"
							aria-label="Buscar na árvore de preparações"
						/>
					</div>

					<Popover>
						<PopoverTrigger render={<Button variant="outline" size="sm" className="shrink-0 gap-2" aria-label="Opções de busca" />}>
							<SlidersHorizontal className="size-4" />
							<span className="hidden sm:inline">Opções</span>
							{(searchCaseSensitive || searchAccentSensitive || onlyWeeklyMenu || onlyNotReviewed) && (
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

				{/* Ações (direita) — `min-w-0` deixa o bloco encolher e quebrar em duas linhas
				    em vez de transbordar por cima da busca. */}
				<div className="flex flex-wrap items-center gap-2 min-w-0 min-[1400px]:justify-end">
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
							<Button
								variant="outline"
								size="sm"
								onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
								aria-label={sortDirection === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"}
							>
								{sortDirection === "asc" ? <ArrowDownAZ className="size-4 mr-2" /> : <ArrowDownZA className="size-4 mr-2" />}
								<span className="hidden sm:inline">{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
							</Button>

							<ButtonGroup>
								<Button variant="outline" size="sm" onClick={expandAll} aria-label="Expandir tudo">
									Expandir Tudo
								</Button>
								<Button variant="outline" size="sm" onClick={collapseAll} aria-label="Recolher tudo">
									Recolher Tudo
								</Button>
							</ButtonGroup>

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

			{/* Árvore Virtualizada */}
			<Card>
				<div ref={parentRef} className="h-150 overflow-auto" role="tree" aria-label="Árvore de preparações">
					{showLoading ? (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Carregando preparações...</div>
					) : tree.nodes.length === 0 ? (
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
						<div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
							{virtualizer.getVirtualItems().map((vRow) => {
								const node = tree.nodes[vRow.index]
								if (!node) return null
								const rowStyle = {
									position: "absolute" as const,
									top: 0,
									left: 0,
									width: "100%",
									height: `${vRow.size}px`,
									transform: `translateY(${vRow.start}px)`,
								}

								if (node.type === "folder") {
									return (
										<div key={vRow.key} style={rowStyle}>
											<TreeRow
												level={0}
												hasChildren={node.hasChildren}
												isExpanded={node.isExpanded}
												onToggle={() => toggleExpand(node.id)}
												icon={FolderIcon}
												// "Sem pasta" não é uma pasta do catálogo: fica em tom neutro.
												tone={node.isUnfiled ? TREE_MUTED_TONE : treeFolderTone(0)}
												label={node.label}
												onActivate={node.hasChildren ? () => toggleExpand(node.id) : undefined}
											>
												<span className={cn("text-sm truncate leading-normal font-bold uppercase tracking-wide", node.isUnfiled && "text-muted-foreground")}>
													{node.label}
												</span>
												<Badge variant="outline" className="shrink-0 text-muted-foreground">
													{node.recipeCount} {node.recipeCount === 1 ? "preparação" : "preparações"}
												</Badge>
											</TreeRow>
										</div>
									)
								}

								const recipe = node.data
								const isSelected = selected.has(recipe.id)
								const isDeleted = !!recipe.deleted_at
								const reviewedAt = reviewedAtById.get(recipe.id)
								return (
									<div key={vRow.key} style={rowStyle}>
										<TreeRow
											level={1}
											icon={recipe.kitchen_id ? ChefHat : Globe}
											tone={recipe.kitchen_id ? TREE_MUTED_TONE : TREE_LEAF_TONE}
											label={recipe.name}
											selectionMode={selectionMode}
											selected={isSelected}
											onSelectChange={(checked) => toggleSelect(recipe, checked)}
											onActivate={() => navigateToRecipe(recipe.id)}
											actions={
												<>
													{recipe.portion_yield != null && <span className="text-sm text-muted-foreground font-mono">{recipe.portion_yield} porções</span>}
													{!recipe.kitchen_id && (
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
												</>
											}
										>
											<HoverCard>
												<HoverCardTrigger
													render={
														<span className={cn("text-sm truncate font-normal cursor-default", isDeleted && "line-through text-muted-foreground")}>
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
													<Tooltip>
														<TooltipTrigger
															render={
																<Badge variant="outline" className="gap-1 text-muted-foreground shrink-0">
																	<CalendarCheck className="size-3" />
																	<span className="hidden sm:inline">Revisada {formatReviewDate(reviewedAt)}</span>
																</Badge>
															}
														/>
														<TooltipContent>Última revisão em {formatReviewDate(reviewedAt)}</TooltipContent>
													</Tooltip>
												) : (
													<Tooltip>
														<TooltipTrigger
															render={
																<Badge variant="warning" className="shrink-0">
																	Não revisada
																</Badge>
															}
														/>
														<TooltipContent>Preparação ainda não revisada</TooltipContent>
													</Tooltip>
												))}
											{recipe.version > 1 && (
												<Badge variant="secondary" className="rounded-full px-2 py-0 font-mono text-xs shrink-0">
													v{recipe.version}
												</Badge>
											)}
											{/* Na listagem de uma cozinha convivem as preparações globais (catálogo da SDAB)
											    e as cópias locais dela. `base_recipe_id` NÃO distingue as duas: toda versão a
											    partir da segunda o carrega, seja global ou local. O sinal correto é kitchen_id. */}
											{kitchenIdNum != null && (
												<Badge variant={recipe.kitchen_id == null ? "outline" : "secondary"} className="text-xs shrink-0">
													{recipe.kitchen_id == null ? "Global" : "Cópia local"}
												</Badge>
											)}
										</TreeRow>
									</div>
								)
							})}
						</div>
					)}
				</div>
				<CardFooter className="flex-col items-stretch gap-3 text-xs text-muted-foreground select-none sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<span>
							{tree.folderCount} {tree.folderCount === 1 ? "pasta" : "pastas"}
						</span>
						<span aria-hidden>·</span>
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
					</div>

					{/* Recortes de visualização — mesmo lugar dos chips da árvore de insumos.
					    A origem saiu da barra de busca: com ela lá, a barra não cabia em 1440. */}
					<div className="flex items-center gap-2 flex-wrap sm:justify-end">
						<span className="font-medium mr-0.5">Origem</span>
						<ToggleGroup
							value={[type]}
							// Base UI devolve array mesmo em seleção única; desmarcar volta para "Todas".
							onValueChange={(value) => setOrigin((value[0] as "all" | "global" | "local") ?? "all")}
							variant="outline"
							size="sm"
							spacing={1}
							aria-label="Origem da preparação"
						>
							<ToggleGroupItem value="all" aria-label="Todas as origens">
								Todas
							</ToggleGroupItem>
							<ToggleGroupItem value="global" aria-label="Globais (SDAB)">
								Globais (SDAB)
							</ToggleGroupItem>
							<ToggleGroupItem value="local" aria-label="Locais">
								Locais
							</ToggleGroupItem>
						</ToggleGroup>
						<span className="font-medium ml-2 mr-0.5">Mostrar</span>
						<ToggleGroup
							value={showDeleted ? ["excluidas"] : []}
							onValueChange={(value) => setShowDeleted(value.includes("excluidas"))}
							multiple
							variant="outline"
							size="sm"
							spacing={1}
							aria-label="Filtros rápidos de busca"
						>
							<ToggleGroupItem value="excluidas" aria-label="Excluídas">
								Excluídas
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
				</CardFooter>
			</Card>

			{/* Localizar e substituir */}
			<RecipesFindReplaceDialog isOpen={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} kitchenId={kitchenIdNum} />

			{/* Catálogo de pastas (criar / renomear / excluir) — aberto pelo PageHeader da rota. */}
			<RecipeFoldersDialog open={foldersDialogOpen} onOpenChange={setFoldersDialogOpen} />

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
