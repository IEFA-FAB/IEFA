import {
	Badge,
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@iefa/ui";
import { Check } from "lucide-react";
import React from "react";
import { useRecipes } from "@/hooks/data/useRecipes";
import type { Recipe } from "@/types/supabase.types";

interface RecipeSelectorProps {
	open: boolean;
	onClose: () => void;
	kitchenId: number | null;
	selectedRecipeIds: string[];
	onSelect: (recipeIds: string[]) => void;
	multiSelect?: boolean;
}

/**
 * Recipe Selector Modal
 *
 * Permite buscar e selecionar recipes para adicionar ao template.
 * Suporta single e multi-select.
 *
 * @example
 * ```tsx
 * <RecipeSelector
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   kitchenId={1}
 *   selectedRecipeIds={[]}
 *   onSelect={(ids) => console.log(ids)}
 *   multiSelect
 * />
 * ```
 */
export function RecipeSelector({
	open,
	onClose,
	kitchenId,
	selectedRecipeIds,
	onSelect,
	multiSelect = true,
}: RecipeSelectorProps) {
	const { data: recipes, isLoading } = useRecipes();
	const [searchQuery, setSearchQuery] = React.useState("");
	const [tempSelected, setTempSelected] =
		React.useState<string[]>(selectedRecipeIds);

	// Reset temp selection when dialog opens
	React.useEffect(() => {
		if (open) {
			setTempSelected(selectedRecipeIds);
			setSearchQuery("");
		}
	}, [open, selectedRecipeIds]);

	// Filtrar recipes por kitchen (globais + kitchen específica)
	const filteredRecipes = React.useMemo(() => {
		if (!recipes) return [];

		return recipes.filter((recipe) => {
			// Filter by kitchen
			const matchesKitchen =
				recipe.kitchen_id === null || recipe.kitchen_id === kitchenId;

			// Filter by search query
			const matchesSearch =
				searchQuery === "" ||
				recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				recipe.code?.toLowerCase().includes(searchQuery.toLowerCase());

			return matchesKitchen && matchesSearch;
		});
	}, [recipes, kitchenId, searchQuery]);

	const handleToggleRecipe = (recipeId: string) => {
		if (multiSelect) {
			setTempSelected((prev) =>
				prev.includes(recipeId)
					? prev.filter((id) => id !== recipeId)
					: [...prev, recipeId],
			);
		} else {
			setTempSelected([recipeId]);
		}
	};

	const handleConfirm = () => {
		onSelect(tempSelected);
		onClose();
	};

	const selectedCount = tempSelected.length;

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-4xl max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>Selecionar Receitas</DialogTitle>
					<DialogDescription>
						{multiSelect
							? "Selecione uma ou mais receitas para adicionar ao template."
							: "Selecione uma receita."}
					</DialogDescription>
				</DialogHeader>

				<Command className="border rounded-lg">
					<CommandInput
						placeholder="Buscar por nome ou código..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[400px]">
						{isLoading ? (
							<div className="py-6 text-center text-sm text-muted-foreground">
								Carregando receitas...
							</div>
						) : filteredRecipes.length === 0 ? (
							<CommandEmpty>Nenhuma receita encontrada.</CommandEmpty>
						) : (
							<CommandGroup>
								{filteredRecipes.map((recipe) => {
									const isSelected = tempSelected.includes(recipe.id);

									return (
										<CommandItem
											key={recipe.id}
											value={recipe.id}
											onSelect={() => handleToggleRecipe(recipe.id)}
											className="flex items-center gap-3 py-3"
										>
											<div
												className={`flex h-5 w-5 items-center justify-center rounded border ${
													isSelected
														? "bg-primary border-primary"
														: "border-muted-foreground"
												}`}
											>
												{isSelected && (
													<Check className="h-3 w-3 text-primary-foreground" />
												)}
											</div>

											<div className="flex-1">
												<div className="flex items-center gap-2">
													<span className="font-medium">{recipe.name}</span>
													{recipe.kitchen_id === null && (
														<Badge variant="outline" className="text-xs">
															Global
														</Badge>
													)}
												</div>
												{recipe.code && (
													<span className="text-xs text-muted-foreground font-mono">
														{recipe.code}
													</span>
												)}
											</div>

											{recipe.yield_quantity && (
												<span className="text-xs text-muted-foreground">
													Rende: {recipe.yield_quantity} porções
												</span>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
					</CommandList>
				</Command>

				<DialogFooter className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{selectedCount > 0 ? (
							<span>
								{selectedCount} receita{selectedCount > 1 ? "s" : ""}{" "}
								selecionada
								{selectedCount > 1 ? "s" : ""}
							</span>
						) : (
							<span>Nenhuma receita selecionada</span>
						)}
					</div>
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<Button
							type="button"
							onClick={handleConfirm}
							disabled={selectedCount === 0}
						>
							Confirmar ({selectedCount})
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
