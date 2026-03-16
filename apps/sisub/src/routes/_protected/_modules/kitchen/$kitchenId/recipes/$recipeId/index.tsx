import { createFileRoute } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { RecipeForm } from "@/components/features/shared/RecipeForm"
import { useRecipe } from "@/hooks/data/useRecipe"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId/")({
	component: EditRecipePage,
})

function EditRecipePage() {
	const { recipeId } = Route.useParams()
	const { data: recipe, isLoading, error } = useRecipe(recipeId)

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !recipe) {
		return <div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">Preparação não encontrada ou erro ao carregar.</div>
	}

	return <RecipeForm mode="edit" initialData={recipe} />
}
