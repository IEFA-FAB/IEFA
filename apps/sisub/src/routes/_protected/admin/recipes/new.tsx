import { createFileRoute } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { RecipeForm } from "@/components/features/admin/RecipeForm"
import { useRecipe } from "@/hooks/data/useRecipe"

const createSearchSchema = z.object({
	forkFrom: z.string().optional(),
})

export const Route = createFileRoute("/_protected/admin/recipes/new")({
	component: CreateRecipePage,
	validateSearch: createSearchSchema,
})

function CreateRecipePage() {
	const { forkFrom } = Route.useSearch()

	// If forking, fetch the base recipe data
	const { data: baseRecipe, isLoading } = useRecipe(forkFrom)

	if (forkFrom && isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return <RecipeForm mode={forkFrom ? "fork" : "create"} initialData={baseRecipe} />
}
