import { Button, Card, Input } from "@iefa/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	FolderPlus,
	Loader2,
	PackagePlus,
	Search,
	ShoppingCart,
} from "lucide-react";
import { useRef, useState } from "react";
import { useProductsHierarchy } from "@/hooks/data/useProductsHierarchy";
import type {
	Folder,
	Product,
	ProductDialogState,
	ProductItem,
} from "@/types/domain/products";
import { FolderForm } from "./FolderForm";
import { ProductForm } from "./ProductForm";
import { ProductItemForm } from "./ProductItemForm";
import { ProductsTreeNode } from "./ProductsTreeNode";

/**
 * Componente principal de gestão de insumos
 * Implementa:
 * - Tree View hierárquica
 * - Virtualização para performance (RF03)
 * - Filtro client-side instantâneo
 * - CRUD completo com formulários
 * - Industrial-Technical aesthetic (frontend-design)
 */
export function ProductsTreeManager() {
	const [filterText, setFilterText] = useState("");
	const [dialogState, setDialogState] = useState<ProductDialogState>({
		isOpen: false,
		mode: "create",
		type: "folder",
	});

	// Dados com hook personalizado
	const { flatTree, stats, error, refetch } = useProductsHierarchy(filterText);

	// Virtualização
	const parentRef = useRef<HTMLDivElement>(null);
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
	});

	// Handlers de diálogo
	const handleOpenDialog = (
		type: ProductDialogState["type"],
		mode: "create" | "edit" = "create",
		data?: Folder | Product | ProductItem,
		parentId?: string | null,
	) => {
		setDialogState({
			isOpen: true,
			mode,
			type,
			data,
			parentId,
		});
	};

	const handleCloseDialog = () => {
		setDialogState({
			isOpen: false,
			mode: "create",
			type: "folder",
		});
	};

	// Loading state
	if (!flatTree && !error) {
		return (
			<div className="flex items-center justify-center h-96">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	// Error state (local, com retry)
	if (error) {
		return (
			<Card className="p-6">
				<div className="text-center space-y-4">
					<p className="text-destructive">
						Erro ao carregar árvore de produtos
					</p>
					<p className="text-sm text-muted-foreground">{error.message}</p>
					<Button onClick={() => refetch()}>Tentar Novamente</Button>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header com Ações */}
			<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
				<div className="flex-1 relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform group-focus-within:rotate-12" />
					<Input
						type="search"
						placeholder="Buscar insumos, produtos ou itens..."
						value={filterText}
						onChange={(e) => setFilterText(e.target.value)}
						className="pl-10 group"
						aria-label="Buscar na árvore de produtos"
					/>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("folder", "create")}
						aria-label="Nova pasta"
						className="flex-1 sm:flex-none transition-all active:scale-[0.98]"
					>
						<FolderPlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Nova Pasta</span>
						<span className="sm:hidden">Pasta</span>
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("product", "create")}
						aria-label="Novo produto"
						className="flex-1 sm:flex-none transition-all active:scale-[0.98]"
					>
						<PackagePlus className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Novo Produto</span>
						<span className="sm:hidden">Produto</span>
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("product_item", "create")}
						aria-label="Novo item de compra"
						className="flex-1 sm:flex-none transition-all active:scale-[0.98]"
					>
						<ShoppingCart className="w-4 h-4 mr-2" />
						<span className="hidden sm:inline">Novo Item</span>
						<span className="sm:hidden">Item</span>
					</Button>
				</div>
			</div>

			{/* Stats - Industrial-Technical Design */}
			{stats && (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-6">
					{/* Folders Card - Dominant (col-span-5) */}
					<Card className="group sm:col-span-1 lg:col-span-5 stagger-item transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg border border-border/50 bg-gradient-to-br from-card to-muted/10">
						<div className="p-4 md:p-6">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm font-sans text-muted-foreground">
										Pastas
									</div>
									<div className="text-2xl md:text-3xl font-mono font-bold mt-1">
										{stats.totalFolders}
									</div>
								</div>
								<div className="transition-transform duration-200 group-hover:rotate-12 opacity-50">
									<FolderPlus className="w-8 h-8 md:w-10 md:h-10 text-amber-600 dark:text-amber-500" />
								</div>
							</div>
						</div>
					</Card>

					{/* Products Card - Medium (col-span-4) */}
					<Card
						className="group sm:col-span-1 lg:col-span-4 stagger-item transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg border border-border/50 bg-gradient-to-br from-card to-muted/10"
						style={{ animationDelay: "0.1s" }}
					>
						<div className="p-4 md:p-6">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm font-sans text-muted-foreground">
										Produtos
									</div>
									<div className="text-2xl md:text-3xl font-mono font-bold mt-1">
										{stats.totalProducts}
									</div>
								</div>
								<div className="transition-transform duration-200 group-hover:scale-110 opacity-50">
									<PackagePlus className="w-8 h-8 md:w-10 md:h-10 text-blue-600 dark:text-blue-500" />
								</div>
							</div>
						</div>
					</Card>

					{/* Items Card - Compact (col-span-3) */}
					<Card
						className="group sm:col-span-2 lg:col-span-3 stagger-item transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg border border-border/50 bg-gradient-to-br from-card to-muted/10"
						style={{ animationDelay: "0.15s" }}
					>
						<div className="p-4 md:p-6">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm font-sans text-muted-foreground">
										Itens de Compra
									</div>
									<div className="text-2xl md:text-3xl font-mono font-bold mt-1">
										{stats.totalItems}
									</div>
								</div>
								<div className="transition-transform duration-200 group-hover:-rotate-12 opacity-50">
									<ShoppingCart className="w-8 h-8 md:w-10 md:h-10 text-emerald-600 dark:text-emerald-500" />
								</div>
							</div>
						</div>
					</Card>
				</div>
			)}

			{/* Árvore Virtualizada - Enhanced Container */}
			<Card className="border border-border/50 shadow-md">
				<div
					ref={parentRef}
					className="h-150 overflow-auto"
					role="tree"
					aria-label="Árvore de produtos"
				>
					{flatTree && flatTree.nodes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">Nenhum item encontrado</p>
							{filterText && (
								<p className="text-sm mt-2">
									Tente ajustar os filtros de busca
								</p>
							)}
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
								const node = flatTree?.nodes[virtualRow.index];
								if (!node) return null;
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
											onEdit={(type, data) =>
												handleOpenDialog(type, "edit", data)
											}
										/>
									</div>
								);
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
					folder={
						dialogState.mode === "edit" &&
						dialogState.data &&
						"parent_id" in dialogState.data
							? (dialogState.data as Folder)
							: undefined
					}
				/>
			)}

			{dialogState.type === "product" && (
				<ProductForm
					isOpen={dialogState.isOpen}
					onClose={handleCloseDialog}
					mode={dialogState.mode}
					product={
						dialogState.mode === "edit" &&
						dialogState.data &&
						"measure_unit" in dialogState.data
							? (dialogState.data as Product)
							: undefined
					}
					defaultFolderId={dialogState.parentId ?? undefined}
				/>
			)}

			{dialogState.type === "product_item" && (
				<ProductItemForm
					isOpen={dialogState.isOpen}
					onClose={handleCloseDialog}
					mode={dialogState.mode}
					productItem={
						dialogState.mode === "edit" &&
						dialogState.data &&
						"product_id" in dialogState.data
							? (dialogState.data as ProductItem)
							: undefined
					}
					defaultProductId={dialogState.parentId ?? undefined}
				/>
			)}
		</div>
	);
}
