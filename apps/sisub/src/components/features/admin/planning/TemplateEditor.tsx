import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Textarea,
} from "@iefa/ui";
import { Loader2 } from "lucide-react";
import React from "react";
import { useMealTypes } from "@/hooks/data/useMealTypes";
import { useRecipes } from "@/hooks/data/useRecipes";
import {
	useCreateTemplate,
	useTemplate,
	useUpdateTemplate,
} from "@/hooks/data/useTemplates";
import type { TemplateItemDraft } from "@/types/domain/planning";
import type { Recipe } from "@/types/supabase.types";
import { RecipeSelector } from "./RecipeSelector";
import { TemplateGridCell } from "./TemplateGridCell";

interface TemplateEditorProps {
	open: boolean;
	onClose: () => void;
	kitchenId: number | null;
	templateId?: string | null; // null = create, string = edit
}

const WEEKDAYS = [
	{ num: 1, label: "Segunda" },
	{ num: 2, label: "Terça" },
	{ num: 3, label: "Quarta" },
	{ num: 4, label: "Quinta" },
	{ num: 5, label: "Sexta" },
	{ num: 6, label: "Sábado" },
	{ num: 7, label: "Domingo" },
];

/**
 * Template Editor com Grid 7x7
 *
 * Editor visual para criar/editar templates semanais.
 * Grid interativo: 7 colunas (dias) × N linhas (meal types)
 *
 * @example
 * ```tsx
 * <TemplateEditor
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   kitchenId={1}
 *   templateId={null} // ou templateId="uuid" para editar
 * />
 * ```
 */
export function TemplateEditor({
	open,
	onClose,
	kitchenId,
	templateId,
}: TemplateEditorProps) {
	const isEditing = !!templateId;

	// Data hooks
	const { data: mealTypes } = useMealTypes(kitchenId);
	const { data: allRecipes } = useRecipes();
	const { data: existingTemplate } = useTemplate(templateId);
	const { mutate: createTemplate, isPending: isCreating } = useCreateTemplate();
	const { mutate: updateTemplate, isPending: isUpdating } = useUpdateTemplate();

	const isPending = isCreating || isUpdating;

	// Form state
	const [name, setName] = React.useState("");
	const [description, setDescription] = React.useState("");
	const [items, setItems] = React.useState<TemplateItemDraft[]>([]);

	// Recipe selector state
	const [selectorOpen, setSelectorOpen] = React.useState(false);
	const [selectedCell, setSelectedCell] = React.useState<{
		dayOfWeek: number;
		mealTypeId: string;
	} | null>(null);

	// Initialize form when editing
	React.useEffect(() => {
		if (existingTemplate && open) {
			setName(existingTemplate.name);
			setDescription(existingTemplate.description || "");
			setItems(
				existingTemplate.items.map((item) => ({
					day_of_week: item.day_of_week,
					meal_type_id: item.meal_type_id,
					recipe_id: item.recipe_id,
				})),
			);
		} else if (!isEditing && open) {
			// Reset for create
			setName("");
			setDescription("");
			setItems([]);
		}
	}, [existingTemplate, isEditing, open]);

	// Get recipes for a specific cell
	const getCellRecipes = (dayOfWeek: number, mealTypeId: string): Recipe[] => {
		const cellRecipeIds = items
			.filter(
				(item) =>
					item.day_of_week === dayOfWeek && item.meal_type_id === mealTypeId,
			)
			.map((item) => item.recipe_id);

		return (
			allRecipes?.filter((recipe) => cellRecipeIds.includes(recipe.id)) || []
		);
	};

	// Handle adding recipes to cell
	const handleOpenSelector = (dayOfWeek: number, mealTypeId: string) => {
		setSelectedCell({ dayOfWeek, mealTypeId });
		setSelectorOpen(true);
	};

	// Handle recipe selection from modal
	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedCell) return;

		// Remove existing items for this cell
		const filtered = items.filter(
			(item) =>
				!(
					item.day_of_week === selectedCell.dayOfWeek &&
					item.meal_type_id === selectedCell.mealTypeId
				),
		);

		// Add new items
		const newItems = recipeIds.map((recipeId) => ({
			day_of_week: selectedCell.dayOfWeek,
			meal_type_id: selectedCell.mealTypeId,
			recipe_id: recipeId,
		}));

		setItems([...filtered, ...newItems]);
		setSelectedCell(null);
	};

	// Handle removing a recipe
	const handleRemoveRecipe = (
		dayOfWeek: number,
		mealTypeId: string,
		recipeId: string,
	) => {
		setItems(
			items.filter(
				(item) =>
					!(
						item.day_of_week === dayOfWeek &&
						item.meal_type_id === mealTypeId &&
						item.recipe_id === recipeId
					),
			),
		);
	};

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!kitchenId || !name.trim()) return;

		const templateData = {
			name: name.trim(),
			description: description.trim() || undefined,
			kitchen_id: kitchenId,
		};

		if (isEditing && templateId) {
			updateTemplate(
				{
					id: templateId,
					updates: templateData,
					items: items.map((item) => ({
						day_of_week: item.day_of_week,
						meal_type_id: item.meal_type_id,
						recipe_id: item.recipe_id,
					})),
				},
				{
					onSuccess: () => {
						onClose();
					},
				},
			);
		} else {
			createTemplate(
				{
					template: templateData,
					items: items.map((item) => ({
						day_of_week: item.day_of_week,
						meal_type_id: item.meal_type_id,
						recipe_id: item.recipe_id,
					})),
				},
				{
					onSuccess: () => {
						onClose();
					},
				},
			);
		}
	};

	const currentCellRecipeIds = selectedCell
		? items
				.filter(
					(item) =>
						item.day_of_week === selectedCell.dayOfWeek &&
						item.meal_type_id === selectedCell.mealTypeId,
				)
				.map((item) => item.recipe_id)
		: [];

	if (!kitchenId) {
		return null;
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onClose}>
				<DialogContent className="sm:max-w-[95vw] w-full max-h-[95vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{isEditing ? "Editar Template" : "Novo Template Semanal"}
						</DialogTitle>
						<DialogDescription>
							Configure as receitas para cada dia e período de refeição.
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Metadata */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Nome do Template *</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Ex: Semana Padrão, Feriados"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="description">Descrição (opcional)</Label>
								<Textarea
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Breve descrição do template"
									rows={1}
								/>
							</div>
						</div>

						{/* Grid 7x7 */}
						<div className="space-y-3">
							<h3 className="text-sm font-medium">Planejamento Semanal</h3>
							<div className="border rounded-lg overflow-x-auto">
								<div className="min-w-[1200px]">
									{/* Header Row (Weekdays) */}
									<div className="grid grid-cols-8 gap-px bg-muted p-px">
										<div className="bg-background p-3">
											<span className="text-xs font-medium text-muted-foreground">
												Refeição
											</span>
										</div>
										{WEEKDAYS.map((day) => (
											<div
												key={day.num}
												className="bg-background p-3 text-center"
											>
												<span className="text-xs font-medium">{day.label}</span>
											</div>
										))}
									</div>

									{/* Body Rows (Meal Types) */}
									{mealTypes && mealTypes.length > 0 ? (
										mealTypes.map((mealType) => (
											<div
												key={mealType.id}
												className="grid grid-cols-8 gap-px bg-muted p-px"
											>
												{/* Meal Type Label */}
												<div className="bg-background p-3 flex items-center">
													<span className="text-sm font-medium">
														{mealType.name}
													</span>
												</div>

												{/* Day Cells */}
												{WEEKDAYS.map((day) => (
													<div
														key={`${day.num}-${mealType.id}`}
														className="bg-background p-2"
													>
														<TemplateGridCell
															dayOfWeek={day.num}
															mealTypeId={mealType.id}
															mealTypeName={mealType.name}
															recipes={getCellRecipes(day.num, mealType.id)}
															onAddRecipes={() =>
																handleOpenSelector(day.num, mealType.id)
															}
															onRemoveRecipe={(recipeId) =>
																handleRemoveRecipe(
																	day.num,
																	mealType.id,
																	recipeId,
																)
															}
														/>
													</div>
												))}
											</div>
										))
									) : (
										<div className="p-8 text-center text-sm text-muted-foreground">
											Nenhum tipo de refeição disponível. Crie tipos de refeição
											primeiro.
										</div>
									)}
								</div>
							</div>
						</div>

						{/* Actions */}
						<DialogFooter>
							<div className="flex items-center justify-between w-full">
								<p className="text-xs text-muted-foreground">
									{items.length} receita{items.length !== 1 ? "s" : ""} no
									template
								</p>
								<div className="flex gap-2">
									<Button type="button" variant="outline" onClick={onClose}>
										Cancelar
									</Button>
									<Button type="submit" disabled={isPending || !name.trim()}>
										{isPending && (
											<Loader2 className="w-4 h-4 mr-2 animate-spin" />
										)}
										{isEditing ? "Salvar Alterações" : "Criar Template"}
									</Button>
								</div>
							</div>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Recipe Selector Modal */}
			<RecipeSelector
				open={selectorOpen}
				onClose={() => {
					setSelectorOpen(false);
					setSelectedCell(null);
				}}
				kitchenId={kitchenId}
				selectedRecipeIds={currentCellRecipeIds}
				onSelect={handleSelectRecipes}
				multiSelect
			/>
		</>
	);
}
