import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderPlus, Loader2, PackagePlus, Search } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
import type { Folder, Ingredient, IngredientDialogState } from "@/types/domain/ingredients"
import { FolderForm } from "./FolderForm"
import { IngredientForm } from "./IngredientForm"
import { IngredientsTreeNode } from "./IngredientsTreeNode"

/**
 * Gerenciador da árvore de insumos
 * Responsabilidade: Pastas + Produtos (hierarquia e CRUD)
 * Itens de compra vivem em /global/ingredients/$ingredientId
 */
export function IngredientsTreeManager() {
	"use no memo"
	const navigate = useNavigate()
	const [filterText, setFilterText] = useState("")
	const [dialogState, setDialogState] = useState<IngredientDialogState>({
		isOpen: false,
		mode: "create",
		type: "folder",
	})

	const { flatTree, stats, itemCountByIngredientId, error, refetch, toggleExpand, expandAll, collapseAll } = useIngredientsHierarchy(filterText)

	// Virtualização
	const parentRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
		// Chave estável por ID: evita reutilização errada de DOM ao filtrar/reordenar
		getItemKey: (index) => flatTree?.nodes[index]?.id ?? index,
	})

	const handleOpenDialog = (type: "folder" | "ingredient", mode: "create" | "edit" = "create", data?: Folder | Ingredient, parentId?: string | null) => {
		setDialogState({ isOpen: true, mode, type, data, parentId })
	}

	const handleCloseDialog = () => {
		setDialogState({ isOpen: false, mode: "create", type: "folder" })
	}

	if (!flatTree && !error) {
		return (
			<div className="flex items-center justify-center h-96">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Buscar pastas ou insumos..."
						value={filterText}
						onChange={(e) => setFilterText(e.target.value)}
						className="pl-10"
						aria-label="Buscar na árvore de insumos"
					/>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onClick={expandAll} aria-label="Expandir tudo">
						Expandir Tudo
					</Button>
					<Button variant="outline" size="sm" onClick={collapseAll} aria-label="Recolher tudo">
						Recolher Tudo
					</Button>

					<Button variant="outline" size="sm" onClick={() => handleOpenDialog("folder", "create")} aria-label="Nova pasta" className="flex-1 sm:flex-none">
						<FolderPlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Nova Pasta</span>
						<span className="sm:hidden">Pasta</span>
					</Button>
					<Button variant="outline" size="sm" onClick={() => handleOpenDialog("ingredient", "create")} aria-label="Novo insumo" className="flex-1 sm:flex-none">
						<PackagePlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Novo Insumo</span>
						<span className="sm:hidden">Insumo</span>
					</Button>
				</div>
			</Card>

			{/* Árvore Virtualizada */}
			<Card>
				<div ref={parentRef} className="h-150 overflow-auto" role="tree" aria-label="Árvore de insumos">
					{flatTree && flatTree.nodes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">Nenhum insumo encontrado</p>
							{filterText && <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>}
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
		</div>
	)
}
