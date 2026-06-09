import { useNavigate, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderPlus, Loader2, Replace, Search, SquareCheckBig, X } from "lucide-react"
import { type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { BulkSelectedNode } from "@/hooks/business/useBulkIngredientOps"
import { useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
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
export type IngredientsTreeManagerHandle = { openCreateIngredient: () => void }

const INGREDIENTS_SCROLL_KEY = "sisub:global-ingredients:scroll"

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

	// Edição em massa
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	const [showDeleted, setShowDeleted] = usePersistentState("sisub:global-ingredients:showDeleted", false)
	const [selectionMode, setSelectionMode] = useState(false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedNode>>(new Map())
	const selectedNodes = useMemo(() => Array.from(selected.values()), [selected])
	const showDeletedId = useId()

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
		"sisub:global-ingredients"
	)

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
	useImperativeHandle(ref, () => ({ openCreateIngredient: () => handleOpenDialog("ingredient", "create") }), [])

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
			<Card className="flex-col sm:flex-row items-stretch sm:items-center gap-4 p-5 overflow-visible">
				<div className="relative flex-1 max-w-md">
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

				<label htmlFor={showDeletedId} className="flex items-center gap-2 text-sm cursor-pointer select-none">
					<Switch id={showDeletedId} checked={showDeleted} onCheckedChange={setShowDeleted} size="sm" />
					Mostrar excluídos
				</label>

				<div className="flex flex-wrap gap-2">
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
							<Button variant="outline" size="sm" onClick={expandAll} aria-label="Expandir tudo">
								Expandir Tudo
							</Button>
							<Button variant="outline" size="sm" onClick={collapseAll} aria-label="Recolher tudo">
								Recolher Tudo
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

							<Button variant="outline" size="sm" onClick={() => handleOpenDialog("folder", "create")} aria-label="Nova pasta" className="flex-1 sm:flex-none">
								<FolderPlus className="size-4 mr-2" />
								<span className="hidden sm:inline">Nova Pasta</span>
								<span className="sm:hidden">Pasta</span>
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
					<CardFooter className="gap-3 text-xs text-muted-foreground select-none">
						<span>
							{stats.totalFolders} {stats.totalFolders === 1 ? "pasta" : "pastas"}
						</span>
						<span aria-hidden>·</span>
						<span>
							{stats.totalIngredients} {stats.totalIngredients === 1 ? "insumo" : "insumos"}
						</span>
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
