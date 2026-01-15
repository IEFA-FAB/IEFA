import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	Input,
} from "@iefa/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useProductsHierarchy } from "@/hooks/data/useProductsHierarchy";
import type { Product } from "@/types/domain/products";

interface IngredientSelectorProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (product: Product) => void;
}

export function IngredientSelector({
	isOpen,
	onClose,
	onSelect,
}: IngredientSelectorProps) {
	const [filterText, setFilterText] = useState("");
	const { flatTree, error } = useProductsHierarchy(filterText);

	// Virtualization
	const parentRef = useRef<HTMLDivElement>(null);
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
	});

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-3xl h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Selecionar Insumo</DialogTitle>
				</DialogHeader>

				<div className="flex items-center gap-2 mb-4">
					<div className="relative flex-1">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Buscar produto..."
							value={filterText}
							onChange={(e) => setFilterText(e.target.value)}
							className="pl-8"
						/>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-hidden min-h-0">
					{!flatTree && !error ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<div className="text-destructive text-center p-4">
							Erro ao carregar insumos
						</div>
					) : (
						<div
							ref={parentRef}
							className="h-full overflow-auto border rounded-md"
						>
							<div
								style={{
									height: `${rowVirtualizer.getTotalSize()}px`,
									width: "100%",
									position: "relative",
								}}
							>
								{rowVirtualizer.getVirtualItems().map((virtualRow) => {
									const node = flatTree!.nodes[virtualRow.index];

									// Only show Folders and Products, hide Items?
									// Recipes link to PRODUCTS (generic).
									// If node.type === 'product_item', skip rendering?
									// Virtualizer counts indexes so we can't easily skip without filtering flatTree first.
									// Ideally useProductsHierarchy should support filtering types.

									if (node.type === "product_item") return null;

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
											{/* Render Node for Selection */}
											<button
												type="button"
												className="flex items-center p-2 hover:bg-muted/50 cursor-pointer border-b w-full text-left"
												style={{ paddingLeft: `${node.level * 20}px` }}
												disabled={node.type !== "product"}
												onClick={() => {
													if (node.type === "product" && node.data) {
														onSelect(node.data as Product);
														onClose();
													}
												}}
												onKeyDown={(e) => {
													if (
														(e.key === "Enter" || e.key === " ") &&
														node.type === "product" &&
														node.data
													) {
														e.preventDefault();
														onSelect(node.data as Product);
														onClose();
													}
												}}
											>
												<span className="mr-2 text-muted-foreground">
													{node.type === "folder" ? "📁" : "📦"}
												</span>
												<span
													className={
														node.type === "product" ? "font-medium" : ""
													}
												>
													{node.label}
												</span>
												{node.type === "product" && (
													<span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
														Selecionar
													</span>
												)}
											</button>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
