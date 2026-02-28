import { createFileRoute } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { RecipeForm } from "@/components/features/shared/RecipeForm"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * GLOBAL-02 — Editar Preparação Global (Padrão FAB)
 * URL: /global/recipes/:recipeId
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/recipes/$recipeId/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: GlobalRecipeEditPage,
	head: () => ({
		meta: [{ title: "Editar Preparação Global - SISUB" }],
	}),
})

function GlobalRecipeEditPage() {
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
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				Preparação não encontrada ou erro ao carregar.
			</div>
		)
	}

	return <RecipeForm mode="edit" initialData={recipe} />
}
