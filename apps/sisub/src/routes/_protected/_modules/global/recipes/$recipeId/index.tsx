import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { RecipeForm } from "@/components/features/shared/RecipeForm"
import { Skeleton } from "@/components/ui/skeleton"
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
			<div className="space-y-6 pb-20">
				<Skeleton className="h-16 w-full" />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
					<Skeleton className="md:col-span-2 h-72" />
					<Skeleton className="h-72" />
				</div>
				<Skeleton className="max-w-5xl mx-auto h-48" />
			</div>
		)
	}

	if (error || !recipe) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive border border-destructive/20">
				{error ? "Erro ao carregar preparação." : "Preparação não encontrada."}
			</div>
		)
	}

	return <RecipeForm mode="edit" initialData={recipe} />
}
