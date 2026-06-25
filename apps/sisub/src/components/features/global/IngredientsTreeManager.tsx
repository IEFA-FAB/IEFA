import { useNavigate, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownAZ, ArrowDownZA, Loader2, Replace, Search, SlidersHorizontal, SquareCheckBig, X } from "lucide-react"
import { type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { BulkSelectedNode } from "@/hooks/business/useBulkIngredientOps"
import { QUICK_FILTER_CATEGORIES, useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { getStoredScrollOffset, usePersistScrollOffset } from "@/hooks/ui/useScrollRestoration"
import type { Folder, Ingredient, IngredientDialogState, IngredientTreeNode } from "@/types/domain/ingredients"
import { BulkActionsBar } from "./BulkActionsBar"
import { BulkFindReplaceDialog } from "./BulkFindReplaceDialog"
import { FolderForm } from "./FolderForm"
import { IngredientForm } from "./IngredientForm"
import { IngredientsTreeNode } from "./IngredientsTreeNode"

/**
 * Gerenciador da árvore de insumos
 * Responsabilidade: Pastas + Produtos (hierarquia e CRUD)
 * Itens de compra vivem em /global/ingredients/$ingredientId
 */
export type IngredientsTreeManagerHandle = { openCreateIngredient: () => void; openCreateFolder: () => void }

const INGREDIENTS_SCROLL_KEY = "sisub:global-ingredients:scroll"

/**
 * Chips de busca rápida (toggle group, multi-seleção). Modelo "marcado = visível":
 * um chip marcado significa que aquela categoria aparece na árvore.
 * - Categorias (Preparações, Pratos/Lanches Prontos): marcadas por padrão; desmarcar oculta a subárvore.
 * - "Excluídos": desmarcado por padrão; marcar mostra os insumos soft-deleted.
 */
const QUICK_FILTER_CHIPS: { key: string; label: string }[] = [
	...QUICK_FILTER_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
	{ key: "excluidos", label: "Excluídos" },
]
const QUICK_CATEGORY_KEYS = QUICK_FILTER_CATEGORIES.map((c) => c.key)
// Categorias visíveis por padrão; "excluidos" começa fora (deleted ocultos).
const DEFAULT_QUICK_FILTERS: string[] = [...QUICK_CATEGORY_KEYS]

export function IngredientsTreeManager({ ref }: { ref?: Ref<IngredientsTreeManagerHandle> }) {
	"use no memo"
	const navigate = useNavigate()
	const navigateRef = useRef(navigate)
	navigateRef.current = navigate

	const { search: urlSearch = "" } = useSearch({ strict: false }) as { search?: string }
	const [inputValue, setInputValue] = useState(urlSearch)
	const isFirstRender = useRef(true)

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		const timer = setTimeout(() => {
			// biome-ignore lint/suspicious/noExplicitAny: shared component, navigate has no from context
			navigateRef.current({ search: { search: inputValue || undefined } as any, replace: true })
		}, 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const [dialogState, setDialogState] = useState<IngredientDialogState>({
		isOpen: false,
		mode: "create",
		type: "folder",
	})

	// Sensibilidade da busca (persistida por aba). Default: insensível a ambos.
	const [searchCaseSensitive, setSearchCaseSensitive] = usePersistentState("sisub:global-ingredients:search:caseSensitive", false)
	const [searchAccentSensitive, setSearchAccentSensitive] = usePersistentState("sisub:global-ingredients:search:accentSensitive", false)

	// Edição em massa
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	// Ordenação alfabética (A-Z / Z-A). Persistida por aba.
	const [sortDirection, setSortDirection] = usePersistentState<"asc" | "desc">("sisub:global-ingredients:sort", "asc")
	// Busca rápida (toggle group multi-seleção). Persistida por aba.
	const [quickFilters, setQuickFilters] = usePersistentState<string[]>("sisub:global-ingredients:quickFilters", DEFAULT_QUICK_FILTERS)
	const showDeleted = quickFilters.includes("excluidos")
	// Categorias desmarcadas → ocultar suas subárvores na hierarquia.
	const hiddenCategoryKeys = useMemo(() => QUICK_CATEGORY_KEYS.filter((k) => !quickFilters.includes(k)), [quickFilters])
	const [selectionMode, setSelectionMode] = useState(false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedNode>>(new Map())
	const selectedNodes = useMemo(() => Array.from(selected.values()), [selected])
	const searchCaseId = useId()
	const searchAccentId = useId()

	const handleSelectChange = (node: IngredientTreeNode, checked: boolean) => {
		setSelected((prev) => {
			const next = new Map(prev)
			if (checked) {
				next.set(node.id, { id: node.id, type: node.type as "folder" | "ingredient", label: node.label, data: node.data as Folder | Ingredient })
			} else {
				next.delete(node.id)
			}
			return next
		})
	}

	const clearSelection = () => setSelected(new Map())

	const exitSelectionMode = () => {
		setSelectionMode(false)
		clearSelection()
	}

	// Hook consumes URL value (already debounced).
	const { flatTree, stats, itemCountByIngredientId, lastReviewByIngredientId, error, refetch, toggleExpand, expandAll, collapseAll } = useIngredientsHierarchy(
		urlSearch,
		showDeleted,
		"sisub:global-ingredients",
		{ caseSensitive: searchCaseSensitive, accentSensitive: searchAccentSensitive },
		hiddenCategoryKeys,
		sortDirection,
		true // default da tela: abrir tudo recolhido
	)

	// Contagem do que está efetivamente visível (após busca + chips). `byId` contém
	// todos os nós incluídos, independente de expand/collapse → reflete o filtro.
	const visibleCounts = useMemo(() => {
		let folders = 0
		let ingredients = 0
		if (flatTree) {
			for (const node of Object.values(flatTree.byId)) {
				if (node.type === "folder") folders++
				else if (node.type === "ingredient") ingredients++
			}
		}
		return { folders, ingredients }
	}, [flatTree])

	// Virtualização
	const parentRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
		// Chave estável por ID: evita reutilização errada de DOM ao filtrar/reordenar
		getItemKey: (index) => flatTree?.nodes[index]?.id ?? index,
		// Restaura o offset salvo ao remontar (ex: voltar de uma página de detalhe).
		initialOffset: () => getStoredScrollOffset(INGREDIENTS_SCROLL_KEY),
	})

	// Persiste o offset de scroll continuamente.
	usePersistScrollOffset(INGREDIENTS_SCROLL_KEY, parentRef, !!flatTree && flatTree.nodes.length > 0)

	const handleOpenDialog = (type: "folder" | "ingredient", mode: "create" | "edit" = "create", data?: Folder | Ingredient, parentId?: string | null) => {
		setDialogState({ isOpen: true, mode, type, data, parentId })
	}

	const handleCloseDialog = () => {
		setDialogState({ isOpen: false, mode: "create", type: "folder" })
	}

	// Expõe a ação "criar insumo" para o PageHeader da rota (botão primário no topo)
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleOpenDialog só envolve setDialogState (estável); handle deve ser criado uma vez
	useImperativeHandle(
		ref,
		() => ({
			openCreateIngredient: () => handleOpenDialog("ingredient", "create"),
			openCreateFolder: () => handleOpenDialog("folder", "create"),
		}),
		[]
	)

	const selectAllVisible = () => {
		if (!flatTree) return
		setSelected((prev) => {
			const next = new Map(prev)
			for (const n of flatTree.nodes) {
				next.set(n.id, { id: n.id, type: n.type as "folder" | "ingredient", label: n.label, data: n.data as Folder | Ingredient })
			}
			return next
		})
	}

	if (!flatTree && !error) {
		return (
			<div className="flex items-center justify-center h-96">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error) {
		return (
			<Card className="p-6">
				<div className="text-center space-y-4">
					<p className="text-destructive">Erro ao carregar árvore de insumos</p>
					<p className="text-sm text-muted-foreground">{error.message}</p>
					<Button onClick={() => refetch()}>Tentar Novamente</Button>
				</div>
			</Card>
		)
	}

	return (
		<div className="space-y-6">
			{/* Toolbar */}
			<Card className="flex-col lg:flex-row lg:items-center gap-3 p-4 overflow-visible">
				{/* Busca + opções de busca (esquerda, cresce até preencher) */}
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<div className="relative flex-1 min-w-56">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Buscar pastas ou insumos..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							className="pl-10"
							aria-label="Buscar na árvore de insumos"
						/>
					</div>

					<Popover>
						<PopoverTrigger render={<Button variant="outline" size="sm" className="shrink-0 gap-2" aria-label="Opções de busca" />}>
							<SlidersHorizontal className="size-4" />
							<span className="hidden sm:inline">Opções</span>
							{(searchCaseSensitive || searchAccentSensitive) && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
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
							</div>
						</PopoverContent>
					</Popover>
				</div>

				{/* Ações (direita) */}
				<div className="flex flex-wrap items-center gap-2 lg:justify-end">
					{selectionMode ? (
						<>
							<Button variant="outline" size="sm" onClick={selectAllVisible} aria-label="Selecionar todos os visíveis">
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
				<div ref={parentRef} className="h-150 overflow-auto" role="tree" aria-label="Árvore de insumos">
					{flatTree && flatTree.nodes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">Nenhum insumo encontrado</p>
							{urlSearch && <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>}
						</div>
					) : (
						<div
							style={{
								height: `${rowVirtualizer.getTotalSize()}px`,
								width: "100%",
								position: "relative",
							}}
						>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const node = flatTree?.nodes[virtualRow.index]
								if (!node) return null
								return (
									<div
										key={virtualRow.key}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
									>
										<IngredientsTreeNode
											node={node}
											onEdit={(type, data) => handleOpenDialog(type as "folder" | "ingredient", "edit", data as Folder | Ingredient)}
											onToggle={toggleExpand}
											itemCount={node.type === "ingredient" ? (itemCountByIngredientId[node.id] ?? 0) : undefined}
											lastReviewedAt={node.type === "ingredient" ? (lastReviewByIngredientId[node.id] ?? null) : undefined}
											selectionMode={selectionMode}
											selected={selected.has(node.id)}
											onSelectChange={(checked) => handleSelectChange(node, checked)}
											onNavigate={
												node.type === "ingredient"
													? () =>
															navigate({
																to: "/global/ingredients/$ingredientId",
																params: { ingredientId: node.id },
															})
													: undefined
											}
										/>
									</div>
								)
							})}
						</div>
					)}
				</div>
				{stats && (
					<CardFooter className="flex-col items-stretch gap-3 text-xs text-muted-foreground select-none sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<span>
								{visibleCounts.folders} {visibleCounts.folders === 1 ? "pasta" : "pastas"}
							</span>
							<span aria-hidden>·</span>
							<span>
								{visibleCounts.ingredients} {visibleCounts.ingredients === 1 ? "insumo" : "insumos"}
								{visibleCounts.ingredients !== stats.totalIngredients && <span className="text-muted-foreground/60"> de {stats.totalIngredients}</span>}
							</span>
						</div>

						{/* Busca rápida — chips (toggle group). Marcado = categoria visível na árvore. */}
						<div className="flex items-center gap-2 flex-wrap sm:justify-end">
							<span className="font-medium mr-0.5">Mostrar</span>
							<ToggleGroup
								value={quickFilters}
								onValueChange={(value) => setQuickFilters(value)}
								multiple
								variant="outline"
								size="sm"
								spacing={1}
								aria-label="Filtros rápidos de busca"
							>
								{QUICK_FILTER_CHIPS.map((chip) => (
									<ToggleGroupItem key={chip.key} value={chip.key} aria-label={chip.label}>
										{chip.label}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
					</CardFooter>
				)}
			</Card>

			{/* Dialogs */}
			{dialogState.type === "folder" && (
				<FolderForm
					isOpen={dialogState.isOpen}
					onClose={handleCloseDialog}
					mode={dialogState.mode}
					folder={dialogState.mode === "edit" && dialogState.data && "parent_id" in dialogState.data ? (dialogState.data as Folder) : undefined}
				/>
			)}

			{dialogState.type === "ingredient" && dialogState.mode === "create" && (
				<IngredientForm isOpen={dialogState.isOpen} onClose={handleCloseDialog} mode="create" defaultFolderId={dialogState.parentId ?? undefined} />
			)}

			{/* Localizar e substituir */}
			<BulkFindReplaceDialog isOpen={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} />

			{/* Barra de ações em massa */}
			{selectionMode && selectedNodes.length > 0 && (
				<BulkActionsBar selectedNodes={selectedNodes} showDeleted={showDeleted} onClear={clearSelection} onDone={clearSelection} />
			)}
		</div>
	)
}
