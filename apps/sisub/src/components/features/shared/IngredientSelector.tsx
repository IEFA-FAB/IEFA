import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, Search, X } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
import { cn } from "@/lib/cn"
import type { Ingredient } from "@/types/domain/ingredients"

interface IngredientSelectorProps {
	isOpen: boolean
	onClose: () => void
	onSelect: (ingredient: Ingredient) => void
}

export function IngredientSelector({ isOpen, onClose, onSelect }: IngredientSelectorProps) {
	"use no memo"
	const [filterText, setFilterText] = useState("")
	const { flatTree, error } = useIngredientsHierarchy(filterText)

	// Virtualization — callback ref triggers re-render so virtualizer
	// subscribes to the real element instead of stale null from useRef
	const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => scrollEl,
		estimateSize: () => 48,
		overscan: 10,
		getItemKey: (index) => flatTree?.nodes[index]?.id ?? index,
	})

	const handleClearSearch = () => {
		setFilterText("")
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-full sm:max-w-3xl h-screen sm:h-[80vh] flex flex-col p-0 sm:p-6 gap-0 sm:gap-4">
				<DialogHeader className="px-6 pt-6 sm:px-0 sm:pt-0">
					<DialogTitle className="font-sans text-display md:text-2xl">Selecionar Insumo</DialogTitle>
				</DialogHeader>

				{/* Search Bar - Enhanced */}
				<div className="px-6 sm:px-0">
					<div className="relative flex items-center">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground transition-transform group-focus-within:scale-110" />
						<Input
							placeholder="Buscar insumo..."
							value={filterText}
							onChange={(e) => setFilterText(e.target.value)}
							className="pl-10 pr-10 group transition-all focus:ring-2 focus:ring-primary/50"
						/>
						{filterText && (
							<button
								type="button"
								onClick={handleClearSearch}
								className="absolute right-3 top-1/2 -translate-y-1/2 size-5 rounded-full hover:bg-muted transition-colors flex items-center justify-center"
								aria-label="Limpar busca"
							>
								<X className="size-3 text-muted-foreground" />
							</button>
						)}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-hidden min-h-0 px-6 pb-6 sm:px-0 sm:pb-0">
					{!flatTree && !error ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="size-8 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<div className="text-destructive text-center p-4">Erro ao carregar insumos</div>
					) : (
						<div ref={setScrollEl} className="h-full overflow-auto border rounded-md bg-card">
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

									// useIngredientsHierarchy nunca insere ingredient_item na árvore visível
									// (itens de compra vivem em /global/ingredients/$ingredientId)
									const isProduct = node.type === "ingredient"
									const iconBg = node.type === "folder" ? "bg-warning/10 dark:bg-warning/20" : "bg-primary/10 dark:bg-primary/20"
									const iconColor = node.type === "folder" ? "text-warning" : "text-primary"

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
												className={cn(
													"flex items-center p-3 w-full text-left border-b border-border/50 transition-all duration-150",
													isProduct ? "hover:bg-primary/5 cursor-pointer" : "cursor-default text-muted-foreground"
												)}
												style={{ paddingLeft: `${node.level * 20 + 12}px` }}
												disabled={!isProduct}
												onClick={() => {
													if (isProduct && node.data) {
														onSelect(node.data as Ingredient)
														onClose()
													}
												}}
												onKeyDown={(e) => {
													if ((e.key === "Enter" || e.key === " ") && isProduct && node.data) {
														e.preventDefault()
														onSelect(node.data as Ingredient)
														onClose()
													}
												}}
											>
												{/* Icon with background */}
												<div
													className={cn(
														"flex items-center justify-center size-7 rounded-md mr-3 border border-border/30 transition-transform",
														iconBg,
														isProduct && "group-hover:scale-110"
													)}
												>
													<span className={cn("text-base", iconColor)}>{node.type === "folder" ? "📁" : "📦"}</span>
												</div>

												<span className={cn("flex-1 font-sans text-sm", isProduct && "text-subheading")}>{node.label}</span>

												{isProduct && (
													<span className="ml-auto px-2.5 py-1 rounded-md text-xs font-mono bg-primary/10 text-primary border border-primary/20 transition-all opacity-0 group-hover:opacity-100">
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
