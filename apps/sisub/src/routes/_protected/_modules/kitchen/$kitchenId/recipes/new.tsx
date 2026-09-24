import { createFileRoute } from "@tanstack/react-router"
import { RecipeForm } from "@/components/features/shared/RecipeForm"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/new")({
	component: CreateRecipePage,
})

function CreateRecipePage() {
	return <RecipeForm mode="create" />
}
