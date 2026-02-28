import { createFileRoute } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { RecipeForm } from "@/components/features/shared/RecipeForm"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * KITCHEN — Adaptar Preparação Global (Fork)
 * Cria uma cópia local independente de uma preparação global.
 * URL: /kitchen/:kitchenId/recipes/:recipeId/fork
 */
export const Route = createFileRoute(
	"/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId/fork"
)({
	component: ForkRecipePage,
	head: () => ({
		meta: [{ title: "Adaptar Preparação - SISUB" }],
	}),
})

function ForkRecipePage() {
	const { recipeId } = Route.useParams()
	const { data: baseRecipe, isLoading, error } = useRecipe(recipeId)

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !baseRecipe) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				Preparação de origem não encontrada ou erro ao carregar.
			</div>
		)
	}

	return <RecipeForm mode="fork" initialData={baseRecipe} />
}
