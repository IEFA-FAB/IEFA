import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@iefa/ui"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRecipes } from "@/hooks/data/useRecipes"

interface RecipeSelectorProps {
	open: boolean
	onClose: () => void
	kitchenId: number | null
	selectedRecipeIds: string[]
	onSelect: (recipeIds: string[]) => void
	multiSelect?: boolean
}

export function RecipeSelector({
	open,
	onClose,
	kitchenId,
	selectedRecipeIds,
	onSelect,
	multiSelect = true,
}: RecipeSelectorProps) {
	const { data: recipes, isLoading } = useRecipes()
	const [searchQuery, setSearchQuery] = useState("")
	const [debouncedQuery, setDebouncedQuery] = useState("")
	const [tempSelected, setTempSelected] = useState<string[]>(selectedRecipeIds)
	const parentRef = useRef<HTMLDivElement>(null)

	// Debounce search by 300ms
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
		return () => clearTimeout(timer)
	}, [searchQuery])

	// Reset temp selection only when dialog transitions from closed → open,
	// avoiding spurious resets when parent re-renders with a new array reference.
	const prevOpenRef = useRef(false)
	useEffect(() => {
		if (open && !prevOpenRef.current) {
			setTempSelected(selectedRecipeIds)
			setSearchQuery("")
			setDebouncedQuery("")
		}
		prevOpenRef.current = open
	}, [open, selectedRecipeIds])

	const filteredRecipes = useMemo(() => {
		if (!recipes) return []

		return recipes.filter((recipe) => {
			const matchesKitchen = recipe.kitchen_id === null || recipe.kitchen_id === kitchenId

			const q = debouncedQuery.toLowerCase()
			const matchesSearch =
				q === "" ||
				recipe.name.toLowerCase().includes(q) ||
				recipe.rational_id?.toLowerCase().includes(q)

			return matchesKitchen && matchesSearch
		})
	}, [recipes, kitchenId, debouncedQuery])

	const rowVirtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 64,
		overscan: 10,
	})

	const handleToggleRecipe = (recipeId: string) => {
		if (multiSelect) {
			setTempSelected((prev) =>
				prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
			)
		} else {
			setTempSelected([recipeId])
		}
	}

	const handleConfirm = () => {
		onSelect(tempSelected)
		onClose()
	}

	const selectedCount = tempSelected.length

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-4xl flex flex-col">
				<DialogHeader>
					<DialogTitle>Selecionar Preparações</DialogTitle>
					<DialogDescription>
						{multiSelect
							? "Selecione uma ou mais Preparações para adicionar ao template."
							: "Selecione uma Preparação."}
					</DialogDescription>
				</DialogHeader>

				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Buscar por nome ou código..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>

				<div className="text-xs text-muted-foreground">
					{isLoading ? "Carregando..." : `${filteredRecipes.length} preparações`}
				</div>

				<div
					ref={parentRef}
					className="overflow-auto border rounded-lg"
					style={{ height: 420 }}
				>
					{isLoading ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							Carregando Preparações...
						</div>
					) : filteredRecipes.length === 0 ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							Nenhuma Preparação encontrada.
						</div>
					) : (
						<div
							style={{
								height: `${rowVirtualizer.getTotalSize()}px`,
								position: "relative",
							}}
						>
							{rowVirtualizer.getVirtualItems().map((virtualItem) => {
								const recipe = filteredRecipes[virtualItem.index]
								const isSelected = tempSelected.includes(recipe.id)

								return (
									<div
										key={recipe.id}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualItem.size}px`,
											transform: `translateY(${virtualItem.start}px)`,
										}}
									>
										<button
											type="button"
											onClick={() => handleToggleRecipe(recipe.id)}
											className={`w-full h-full flex items-center gap-3 px-3 text-left transition-colors hover:bg-accent ${
												isSelected ? "bg-accent/50" : ""
											}`}
										>
											<div
												className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
													isSelected ? "bg-primary border-primary" : "border-muted-foreground"
												}`}
											>
												{isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
											</div>

											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<span className="font-medium truncate">{recipe.name}</span>
													{recipe.kitchen_id === null && (
														<Badge variant="outline" className="text-xs shrink-0">
															Global
														</Badge>
													)}
												</div>
												{recipe.rational_id && (
													<span className="text-xs text-muted-foreground font-mono">
														{recipe.rational_id}
													</span>
												)}
											</div>

											{recipe.portion_yield && (
												<span className="text-xs text-muted-foreground shrink-0">
													{recipe.portion_yield} porções
												</span>
											)}
										</button>
									</div>
								)
							})}
						</div>
					)}
				</div>

				<DialogFooter className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{selectedCount > 0 ? (
							<span>
								{selectedCount} Preparação{selectedCount > 1 ? "s" : ""} selecionada
								{selectedCount > 1 ? "s" : ""}
							</span>
						) : (
							<span>Nenhuma Preparação selecionada</span>
						)}
					</div>
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<Button type="button" onClick={handleConfirm} disabled={selectedCount === 0}>
							Confirmar ({selectedCount})
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
