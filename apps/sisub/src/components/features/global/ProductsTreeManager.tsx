import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderPlus, Loader2, PackagePlus, Search } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useProductsHierarchy } from "@/hooks/data/useProductsHierarchy"
import type { Folder, Product, ProductDialogState } from "@/types/domain/products"
import { FolderForm } from "./FolderForm"
import { ProductForm } from "./ProductForm"
import { ProductsTreeNode } from "./ProductsTreeNode"

/**
 * Gerenciador da árvore de insumos
 * Responsabilidade: Pastas + Produtos (hierarquia e CRUD)
 * Itens de compra vivem em /global/ingredients/$productId
 */
export function ProductsTreeManager() {
	"use no memo"
	const navigate = useNavigate()
	const [filterText, setFilterText] = useState("")
	const [dialogState, setDialogState] = useState<ProductDialogState>({
		isOpen: false,
		mode: "create",
		type: "folder",
	})

	const { flatTree, stats, itemCountByProductId, error, refetch, toggleExpand, expandAll, collapseAll } = useProductsHierarchy(filterText)

	// Virtualização
	const parentRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
	})

	const handleOpenDialog = (type: "folder" | "product", mode: "create" | "edit" = "create", data?: Folder | Product, parentId?: string | null) => {
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
					<p className="text-destructive">Erro ao carregar árvore de produtos</p>
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

					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("folder", "create")}
						aria-label="Nova pasta"
						className="flex-1 sm:flex-none"
					>
							<FolderPlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Nova Pasta</span>
						<span className="sm:hidden">Pasta</span>
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("product", "create")}
						aria-label="Novo insumo"
						className="flex-1 sm:flex-none"
					>
							<PackagePlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Novo Insumo</span>
						<span className="sm:hidden">Insumo</span>
					</Button>
				</div>
			</Card>

			{/* Stats */}
			{stats && (
				<div className="grid grid-cols-2 gap-4">
					<Card>
						<div className="p-4 md:p-6">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm text-muted-foreground">Pastas</div>
									<div className="text-2xl md:text-3xl font-mono font-bold mt-1">{stats.totalFolders}</div>
								</div>
							<FolderPlus className="w-8 h-8 md:w-10 md:h-10 text-warning" />
							</div>
						</div>
					</Card>

					<Card>
						<div className="p-4 md:p-6">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm text-muted-foreground">Insumos</div>
									<div className="text-2xl md:text-3xl font-mono font-bold mt-1">{stats.totalProducts}</div>
								</div>
							<PackagePlus className="w-8 h-8 md:w-10 md:h-10 text-primary" />
							</div>
						</div>
					</Card>
				</div>
			)}

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
										<ProductsTreeNode
											node={node}
											onEdit={(type, data) => handleOpenDialog(type as "folder" | "product", "edit", data as Folder | Product)}
											onToggle={toggleExpand}
											itemCount={node.type === "product" ? (itemCountByProductId[node.id] ?? 0) : undefined}
											onNavigate={
												node.type === "product"
													? () =>
															navigate({
																to: "/global/ingredients/$productId",
																params: { productId: node.id },
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

			{dialogState.type === "product" && (
				<ProductForm
					isOpen={dialogState.isOpen}
					onClose={handleCloseDialog}
					mode={dialogState.mode}
					product={dialogState.mode === "edit" && dialogState.data && "measure_unit" in dialogState.data ? (dialogState.data as Product) : undefined}
					defaultFolderId={dialogState.parentId ?? undefined}
				/>
			)}
		</div>
	)
}
