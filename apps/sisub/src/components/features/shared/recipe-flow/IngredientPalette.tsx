import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/cn"
import type { RecipeIngredientSource } from "@/types/domain/recipe-flow"

interface IngredientPaletteProps {
	ingredients: RecipeIngredientSource[]
	presentIds: Set<string>
	onAdd: (ingredient: RecipeIngredientSource) => void
}

export function IngredientPalette({ ingredients, presentIds, onAdd }: IngredientPaletteProps) {
	return (
		<div className="space-y-1.5">
			<span className="text-label uppercase text-muted-foreground">Insumos da receita</span>
			<div className="space-y-1">
				{ingredients.map((ing) => {
					const present = presentIds.has(ing.recipeIngredientId)
					return (
						<button
							key={ing.recipeIngredientId}
							type="button"
							disabled={present}
							onClick={() => onAdd(ing)}
							className={cn(
								"flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left transition-colors",
								present ? "opacity-50" : "hover:bg-muted/60"
							)}
						>
							{present ? <Check className="size-3.5 shrink-0 text-success" /> : <Plus className="size-3.5 shrink-0 text-muted-foreground" />}
							<span className="min-w-0 flex-1 truncate text-caption text-foreground">{ing.name}</span>
							<span className="shrink-0 text-caption text-muted-foreground">
								{ing.netQuantity}
								{ing.measureUnit}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}
