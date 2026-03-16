import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { GitCompare, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * KITCHEN — Comparar Versões de uma Preparação (Diff Viewer)
 * URL: /kitchen/:kitchenId/recipes/:recipeId/versions
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId/versions")({
	component: RecipeVersionsPage,
	head: () => ({
		meta: [{ title: "Histórico de Versões - SISUB" }],
	}),
})

function RecipeVersionsPage() {
	const { kitchenId, recipeId } = Route.useParams()
	const navigate = useNavigate()
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

	return (
		<div className="space-y-6">
			<PageHeader
				title="Histórico de Versões"
				description={`Preparação: ${recipe.name}`}
				onBack={() =>
					navigate({
						to: "/kitchen/$kitchenId/recipes/$recipeId",
						params: { kitchenId, recipeId },
					})
				}
			/>

			<div className="mx-auto w-full max-w-3xl space-y-6">
				<div className="rounded-lg border bg-card p-5 space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<GitCompare className="h-4 w-4 text-muted-foreground" />
							<span className="font-medium text-sm">Versão atual</span>
						</div>
						<Badge variant="default">v{recipe.version ?? 1}</Badge>
					</div>
					<p className="text-xs text-muted-foreground">Versão: {recipe.version ?? 1}</p>
				</div>

				<div className="rounded-md border border-dashed p-8 text-center space-y-2">
					<GitCompare className="h-8 w-8 mx-auto text-muted-foreground" />
					<p className="text-sm font-medium text-muted-foreground">Comparador de versões</p>
					<p className="text-xs text-muted-foreground">
						O histórico completo de versões e o diff visual serão exibidos aqui.
						<br />
						Qualquer edição na preparação gera uma nova versão (append-only).
					</p>
				</div>
			</div>
		</div>
	)
}
