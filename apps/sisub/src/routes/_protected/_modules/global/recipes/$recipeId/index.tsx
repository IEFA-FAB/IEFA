import { createFileRoute } from "@tanstack/react-router"
// CSS do React Flow (editor de fluxo de produção) — carregado só nas rotas que o usam.
import XyflowStyles from "@xyflow/react/dist/style.css?url"
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
		links: [{ rel: "stylesheet", href: XyflowStyles }],
	}),
})

function GlobalRecipeEditPage() {
	const { recipeId } = Route.useParams()
	const { data: recipe, isLoading, error } = useRecipe(recipeId)

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-12 w-full" />
				<div className="max-w-5xl mx-auto space-y-8">
					<Skeleton className="h-44 w-full" />
					<Skeleton className="h-60 w-full" />
					<Skeleton className="h-48 w-full" />
				</div>
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
