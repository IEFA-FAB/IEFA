import { Button } from "@iefa/ui"
import { Plus, X } from "lucide-react"
import type { Recipe } from "@/types/supabase.types"

interface TemplateGridCellProps {
	dayOfWeek: number // 1-7
	mealTypeId: string
	mealTypeName: string
	recipes: Recipe[]
	onAddRecipes: () => void
	onRemoveRecipe: (recipeId: string) => void
}

/**
 * Célula do grid de template (interseção dia × meal type)
 *
 * Exibe recipes atribuídas e permite adicionar/remover
 *
 * @example
 * ```tsx
 * <TemplateGridCell
 *   dayOfWeek={1}
 *   mealTypeId="uuid"
 *   mealTypeName="Almoço"
 *   recipes={[...]}
 *   onAddRecipes={() => openSelector()}
 *   onRemoveRecipe={(id) => removeRecipe(id)}
 * />
 * ```
 */
export function TemplateGridCell({
	dayOfWeek: _dayOfWeek,
	mealTypeId: _mealTypeId,
	mealTypeName: _mealTypeName,
	recipes,
	onAddRecipes,
	onRemoveRecipe,
}: TemplateGridCellProps) {
	const hasRecipes = recipes.length > 0

	return (
		<div
			className={`
        relative min-h-[120px] p-3 border rounded-md
        transition-all duration-200
        ${hasRecipes ? "bg-muted/30 border-muted-foreground/20" : "bg-background border-dashed border-muted-foreground/30"}
        hover:border-primary/50 hover:shadow-sm
      `}
		>
			{/* Empty State */}
			{!hasRecipes && (
				<div className="flex flex-col items-center justify-center h-full min-h-[100px] gap-2">
					<Plus className="w-5 h-5 text-muted-foreground/50" />
					<Button
						size="sm"
						variant="ghost"
						onClick={onAddRecipes}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Adicionar receitas
					</Button>
				</div>
			)}

			{/* Recipes List */}
			{hasRecipes && (
				<div className="space-y-2">
					{recipes.map((recipe) => (
						<div
							key={recipe.id}
							className="flex items-start gap-2 p-2 bg-background rounded border border-muted-foreground/10 group hover:border-primary/30 transition-colors"
						>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{recipe.name}</p>
								{recipe.rational_id && (
									<p className="text-xs text-muted-foreground font-mono">{recipe.rational_id}</p>
								)}
							</div>
							<Button
								size="icon"
								variant="ghost"
								className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => onRemoveRecipe(recipe.id)}
								title="Remover"
							>
								<X className="h-3 w-3" />
							</Button>
						</div>
					))}

					{/* Add More Button */}
					<Button size="sm" variant="outline" onClick={onAddRecipes} className="w-full text-xs">
						<Plus className="w-3 h-3 mr-1" />
						Adicionar mais
					</Button>
				</div>
			)}
		</div>
	)
}
