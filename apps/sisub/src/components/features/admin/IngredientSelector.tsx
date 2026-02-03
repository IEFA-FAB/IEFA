import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from "@iefa/ui"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, Search, X } from "lucide-react"
import { useRef, useState } from "react"
import { useProductsHierarchy } from "@/hooks/data/useProductsHierarchy"
import type { Product } from "@/types/domain/products"

interface IngredientSelectorProps {
	isOpen: boolean
	onClose: () => void
	onSelect: (product: Product) => void
}

export function IngredientSelector({ isOpen, onClose, onSelect }: IngredientSelectorProps) {
	const [filterText, setFilterText] = useState("")
	const { flatTree, error } = useProductsHierarchy(filterText)

	// Virtualization
	const parentRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
	})

	const handleClearSearch = () => {
		setFilterText("")
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-full sm:max-w-3xl h-screen sm:h-[80vh] flex flex-col p-0 sm:p-6 gap-0 sm:gap-4">
				<DialogHeader className="px-6 pt-6 sm:px-0 sm:pt-0">
					<DialogTitle className="font-sans font-bold text-xl md:text-2xl">
						Selecionar Insumo
					</DialogTitle>
				</DialogHeader>

				{/* Search Bar - Enhanced */}
				<div className="px-6 sm:px-0">
					<div className="relative flex items-center">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform group-focus-within:scale-110" />
						<Input
							placeholder="Buscar produto..."
							value={filterText}
							onChange={(e) => setFilterText(e.target.value)}
							className="pl-10 pr-10 group transition-all focus:ring-2 focus:ring-primary/50"
							autoFocus
						/>
						{filterText && (
							<button
								type="button"
								onClick={handleClearSearch}
								className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-muted transition-colors flex items-center justify-center"
								aria-label="Limpar busca"
							>
								<X className="h-3 w-3 text-muted-foreground" />
							</button>
						)}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-hidden min-h-0 px-6 pb-6 sm:px-0 sm:pb-0">
					{!flatTree && !error ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<div className="text-destructive text-center p-4">Erro ao carregar insumos</div>
					) : (
						<div
							ref={parentRef}
							className="h-full overflow-auto border rounded-md bg-gradient-to-br from-card to-muted/5"
						>
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

									// Only show Folders and Products, hide Items
									if (node.type === "product_item") return null

									const isProduct = node.type === "product"
									const iconBg =
										node.type === "folder"
											? "bg-amber-500/10 dark:bg-amber-500/20"
											: "bg-blue-500/10 dark:bg-blue-500/20"
									const iconColor =
										node.type === "folder"
											? "text-amber-600 dark:text-amber-500"
											: "text-blue-600 dark:text-blue-500"

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
												className={`flex items-center p-3 w-full text-left border-b border-border/50 transition-all duration-150 ${
													isProduct
														? "hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 cursor-pointer hover:border-l-2 hover:border-l-primary"
														: "cursor-default opacity-60"
												}`}
												style={{ paddingLeft: `${node.level * 20 + 12}px` }}
												disabled={!isProduct}
												onClick={() => {
													if (isProduct && node.data) {
														onSelect(node.data as Product)
														onClose()
													}
												}}
												onKeyDown={(e) => {
													if ((e.key === "Enter" || e.key === " ") && isProduct && node.data) {
														e.preventDefault()
														onSelect(node.data as Product)
														onClose()
													}
												}}
											>
												{/* Icon with background */}
												<div
													className={`flex items-center justify-center w-7 h-7 rounded-md mr-3 ${iconBg} border border-border/30 transition-transform ${
														isProduct ? "group-hover:scale-110" : ""
													}`}
												>
													<span className={`text-base ${iconColor}`}>
														{node.type === "folder" ? "📁" : "📦"}
													</span>
												</div>

												<span
													className={`flex-1 font-sans text-sm ${isProduct ? "font-medium" : ""}`}
												>
													{node.label}
												</span>

												{isProduct && (
													<span className="ml-auto px-2.5 py-1 rounded-md text-xs font-mono tracking-wide bg-primary/10 text-primary border border-primary/20 transition-all opacity-0 group-hover:opacity-100">
														Selecionar
													</span>
												)}
											</button>
										</div>
									)
								})}
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
