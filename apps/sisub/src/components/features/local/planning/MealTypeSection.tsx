import type { Recipe } from "@iefa/database/sisub"
import { Plus, Users, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type MealTypeInfo = { id: string; name: string | null }
export type RecipeWithHeadcount = Recipe & { headcountOverride: number | null }

export function MealTypeSection({
	mealType,
	recipes,
	onOpenSelector,
	onRemoveRecipe,
	onItemHeadcountChange,
	emptyLabel = "Nenhuma preparação atribuída",
}: {
	mealType: MealTypeInfo
	recipes: RecipeWithHeadcount[]
	onOpenSelector: () => void
	onRemoveRecipe: (recipeId: string) => void
	onItemHeadcountChange: (recipeId: string, value: number | null) => void
	emptyLabel?: string
}) {
	const hasRecipes = recipes.length > 0

	return (
		<Card className="overflow-hidden p-0 gap-0">
			<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
				<div className="flex items-center gap-2">
					<span className="text-subheading">{mealType.name}</span>
					{hasRecipes && (
						<Badge variant="secondary" className="text-xs">
							{recipes.length}
						</Badge>
					)}
				</div>

				<Button type="button" size="sm" variant="ghost" onClick={onOpenSelector} className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground">
					<Plus className="size-3.5" />
					Adicionar
				</Button>
			</div>

			{hasRecipes ? (
				<div className="p-3 space-y-1.5">
					{recipes.map((recipe) => (
						<div key={recipe.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 group hover:bg-muted/60 transition-colors">
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">{recipe.name}</p>
								{recipe.rational_id && <p className="text-xs text-muted-foreground font-mono">{recipe.rational_id}</p>}
							</div>

							<Tooltip>
								<TooltipTrigger className="flex items-center gap-1 shrink-0 cursor-default" onClick={(e) => e.stopPropagation()}>
									<Users className="size-3 text-muted-foreground" />
									<Input
										type="number"
										min="1"
										className="h-6 w-20 text-xs"
										value={recipe.headcountOverride ?? ""}
										placeholder="pax"
										onChange={(e) => onItemHeadcountChange(recipe.id, e.target.value ? parseInt(e.target.value, 10) : null)}
										onClick={(e) => e.stopPropagation()}
									/>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p className="text-caption">Comensais desta preparação</p>
									<p className="text-xs opacity-70 mt-0.5">
										{recipe.headcountOverride ? `${recipe.headcountOverride} pessoas previstas` : "Informe o nº de comensais"}
									</p>
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
											onClick={() => onRemoveRecipe(recipe.id)}
										>
											<X className="size-3.5" />
										</Button>
									}
								></TooltipTrigger>
								<TooltipContent>Remover</TooltipContent>
							</Tooltip>
						</div>
					))}
				</div>
			) : (
				<div className="px-4 py-6 text-center">
					<p className="text-xs text-muted-foreground mb-2">{emptyLabel}</p>
					<Button type="button" size="sm" variant="outline" onClick={onOpenSelector} className="text-xs">
						<Plus className="size-3.5 mr-1" />
						Adicionar Preparações
					</Button>
				</div>
			)}
		</Card>
	)
}
