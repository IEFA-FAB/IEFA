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
			<div className="flex items-center justify-between gap-4">
				<div className="flex-1 relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Buscar insumos, produtos ou itens..."
						value={filterText}
						onChange={(e) => setFilterText(e.target.value)}
						className="pl-10"
						aria-label="Buscar na árvore de produtos"
					/>
				</div>

				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("folder", "create")}
						aria-label="Nova pasta"
					>
						<FolderPlus className="w-4 h-4 mr-2" />
						Nova Pasta
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("product", "create")}
						aria-label="Novo produto"
					>
						<PackagePlus className="w-4 h-4 mr-2" />
						Novo Produto
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDialog("product_item", "create")}
						aria-label="Novo item de compra"
					>
						<ShoppingCart className="w-4 h-4 mr-2" />
						Novo Item
					</Button>
				</div>
			</div>

			{/* Stats */}
			{stats && (
				<div className="grid grid-cols-3 gap-4">
					<Card className="p-4">
						<div className="text-sm text-muted-foreground">Pastas</div>
						<div className="text-2xl font-bold">{stats.totalFolders}</div>
					</Card>
					<Card className="p-4">
						<div className="text-sm text-muted-foreground">Produtos</div>
						<div className="text-2xl font-bold">{stats.totalProducts}</div>
					</Card>
					<Card className="p-4">
						<div className="text-sm text-muted-foreground">Itens de Compra</div>
						<div className="text-2xl font-bold">{stats.totalItems}</div>
					</Card>
				</div>
			)}

			{/* Árvore Virtualizada */}
			<Card>
				<div
					ref={parentRef}
					className="h-150 overflow-auto"
					role="tree"
					aria-label="Árvore de produtos"
				>
					{flatTree && flatTree.nodes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
							<p>Nenhum item encontrado</p>
							{filterText && (
								<p className="text-sm">Tente ajustar os filtros de busca</p>
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
